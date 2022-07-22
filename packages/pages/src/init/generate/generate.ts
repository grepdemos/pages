export interface GenerationInfo {
  startStep(step: string): void;
  runCommand(command: string): Promise<number>;
}

export async function generate(info: GenerationInfo) {
  info.startStep("Copying files");
  const gitCloneExitCode = await info.runCommand(
    "git clone https://github.com/yext/pages-starter-react-locations.git ."
  );
  if (gitCloneExitCode) {
    throw new Error(
      "git clone returned a non-zero exit code " + gitCloneExitCode
    );
  }

  info.startStep("Installing dependencies (this may take a while)");
  const npmExitCode = await info.runCommand("npm install");
  if (npmExitCode) {
    throw new Error("npm install returned a non-zero exit code " + npmExitCode);
  }

  info.startStep("Running first build");
  const buildExitCode = await info.runCommand("npm run build");
  if (buildExitCode) {
    throw new Error("failed to build " + buildExitCode);
  }
}
