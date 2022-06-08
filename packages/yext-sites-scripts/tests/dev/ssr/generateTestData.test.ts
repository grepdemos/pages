import { WriteStream } from "tty";
import { generateTestData } from "../../../src/dev/server/ssr/generateTestData";
import { EventEmitter } from "stream";
import {
  CLI_BOILERPLATE_WITH_UPGRADE_LINES,
  CLI_BOILERPLATE_WITHOUT_UPGRADE_LINES,
  UPGRADE_LINES_OF_CLI_BOILERPLATE,
} from "../../fixtures/cli_boilerplate";
import { CLI_STREAM_DATA } from "../../fixtures/cli_stream_data";
import { FEATURE_CONFIG } from "../../fixtures/feature_config";
import { Socket } from "net";

const mockParentProcessStdout = jest.mocked(new WriteStream(0));
mockParentProcessStdout.write = jest.fn();

const mockChildProcessEventEmitter = new EventEmitter();

let mockChildProcess = {
  stdin: new Socket(),
  stdout: new Socket(),
  stderr: new Socket(),
  on: mockChildProcessEventEmitter.on,
  emit: mockChildProcessEventEmitter.emit,
};

afterEach(() => {
  // After each unit test, destroy the streams associated with the previous
  // and create fresh ones.
  mockChildProcess.stdin.destroy();
  mockChildProcess.stdout.destroy();
  mockChildProcess.stderr.destroy();

  // Stale listeners from previous runs must be removed after each test.
  mockChildProcessEventEmitter.removeAllListeners();

  // Reset the mockParentProcessStdout's write function.
  mockParentProcessStdout.write = jest.fn();

  mockChildProcess = {
    stdin: new Socket(),
    stdout: new Socket(),
    stderr: new Socket(),
    // The on and emit functions must be explicitly re-assigned after the stale
    // listeners have been removed after each test.
    on: mockChildProcessEventEmitter.on,
    emit: mockChildProcessEventEmitter.emit,
  };
});

jest.mock("child_process", () => ({
  // this pattern allows us to only override the method we want to mock in the
  // child_process module while leaving the rest of the module's functionality intact.
  ...(jest.requireActual("child_process") as object),
  spawn: jest.fn((): any => {
    return mockChildProcess;
  }),
}));

const getGenerateTestDataRunner = () =>
  generateTestData(mockParentProcessStdout, FEATURE_CONFIG, "loc3");

describe("generateTestData", () => {
  it("properly reads stream data from stdout and returns it as parsed JSON", async () => {
    const testRunnerPromise = getGenerateTestDataRunner();

    mockChildProcess.stdout.emit("data", `${JSON.stringify(CLI_STREAM_DATA)}`);
    mockChildProcess.emit("close");

    const datadoc = await testRunnerPromise;

    expect(datadoc).toEqual(CLI_STREAM_DATA);
    // There is no output from the CLI other than the stream data, so nothing should be
    // written back to the parent process.
    expect(mockParentProcessStdout.write).toBeCalledTimes(0);
  });

  it("properly reads multi-chunk stream data from stdout and returns it as parsed JSON", async () => {
    const testRunnerPromise = getGenerateTestDataRunner();

    const streamDataAsString = JSON.stringify(CLI_STREAM_DATA);
    mockChildProcess.stdout.emit(
      "data",
      `${streamDataAsString.slice(0, streamDataAsString.length / 2)}`
    );
    mockChildProcess.stdout.emit(
      "data",
      `${streamDataAsString.slice(streamDataAsString.length / 2)}`
    );
    mockChildProcess.emit("close");

    const datadoc = await testRunnerPromise;

    expect(datadoc).toEqual(CLI_STREAM_DATA);
    // There is no output from the CLI other than the stream data, so nothing should be
    // written back to the parent process.
    expect(mockParentProcessStdout.write).toBeCalledTimes(0);
  });

  it("properly redirects other output to the parent process' stdout", async () => {
    const testRunnerPromise = getGenerateTestDataRunner();

    const unrecognizedData = "I am unrecognized data";

    mockChildProcess.stdout.emit(
      "data",
      `${CLI_BOILERPLATE_WITHOUT_UPGRADE_LINES}`
    );
    mockChildProcess.stdout.emit("data", `${unrecognizedData}`);
    mockChildProcess.stdout.emit(
      "data",
      `${CLI_BOILERPLATE_WITHOUT_UPGRADE_LINES}`
    );
    mockChildProcess.stdout.emit("data", `${JSON.stringify(CLI_STREAM_DATA)}`);
    mockChildProcess.emit("close");

    const datadoc = await testRunnerPromise;

    expect(datadoc).toEqual(CLI_STREAM_DATA);
    // Make sure we write back the expected messages to the parent process.
    expect(mockParentProcessStdout.write).toHaveBeenCalledTimes(1);
    expect(mockParentProcessStdout.write).toHaveBeenCalledWith(
      unrecognizedData
    );
  });

  it("properly filters CLI Boilerplate and writes back the correct lines", async () => {
    const testRunnerPromise = getGenerateTestDataRunner();

    const unrecognizedData = "I am unrecognized data";

    mockChildProcess.stdout.emit(
      "data",
      `${CLI_BOILERPLATE_WITH_UPGRADE_LINES}`
    );
    mockChildProcess.stdout.emit("data", `${unrecognizedData}`);
    mockChildProcess.stdout.emit("data", `${JSON.stringify(CLI_STREAM_DATA)}`);
    mockChildProcess.emit("close");

    const datadoc = await testRunnerPromise;

    expect(datadoc).toEqual(CLI_STREAM_DATA);
    // Make sure we write back the expected messages to the parent process.
    expect(mockParentProcessStdout.write).toHaveBeenCalledTimes(2);
    expect(mockParentProcessStdout.write).toHaveBeenCalledWith(
      UPGRADE_LINES_OF_CLI_BOILERPLATE
    );
    expect(mockParentProcessStdout.write).toHaveBeenCalledWith(
      unrecognizedData
    );
  });
});
