import {
  TemplateProps,
  TemplateRenderProps,
  Manifest,
  TemplateModule,
  RenderTemplate,
} from "../../../../common/src/template/types.js";
import { getRelativePrefixToRootFromPath } from "../../../../common/src/template/paths.js";
import { reactWrapper } from "./wrapper.js";
import {
  convertTemplateModuleToTemplateModuleInternal,
  TemplateModuleInternal,
} from "../../../../common/src/template/internal/types.js";

const pathToModule = new Map();

/**
 * @returns an array of template modules matching the document's feature.
 */
export const readTemplateModules = async (
  feature: string,
  manifest: Manifest
): Promise<TemplateModuleInternal<any, any>> => {
  const path = manifest.bundlePaths[feature].replace("assets", "..");
  if (!path) {
    throw new Error(`Could not find path for feature ${feature}`);
  }
  let importedModule = pathToModule.get(path) as TemplateModule<any, any>;
  if (!importedModule) {
    importedModule = await import(path);
  }

  const templateModuleInternal = convertTemplateModuleToTemplateModuleInternal(
    path,
    importedModule,
    true
  );

  pathToModule.set(path, templateModuleInternal);

  return templateModuleInternal;
};

/** The render template information needed by the plugin execution */
export interface PluginRenderTemplates {
  /** The server render module */
  server: RenderTemplate;
  /** The client render relative path */
  client: string;
}

/**
 * Creates a {@link PluginRenderTemplates} based on the {@link Manifest}'s renderPaths.
 * @param manifest
 * @returns
 */
export const getPluginRenderTemplates = async (
  manifest: Manifest
): Promise<PluginRenderTemplates> => {
  const serverRenderPath = manifest.renderPaths._server.replace("assets", "..");

  const serverRenderTemplateModule = await importRenderTemplate(
    serverRenderPath
  );

  return {
    server: serverRenderTemplateModule,
    client: manifest.renderPaths._client,
  };
};

// caches dynamically imported plugin render template modules. Without this, dynamically imported
// modules will leak some memory during generation. This can cause issues on a publish with a large
// number of generations.
const pluginRenderTemplatesCache = new Map<string, RenderTemplate>();

const importRenderTemplate = async (path: string): Promise<RenderTemplate> => {
  let module = pluginRenderTemplatesCache.get(path);
  if (!module) {
    module = (await import(path)) as RenderTemplate;
    pluginRenderTemplatesCache.set(path, module);
  }
  return module;
};

// Represents a page produced by the generation procees.
export type GeneratedPage = {
  path: string;
  content?: string;
  redirects: string[];
};

/**
 * Takes in both a template module and its stream document, processes them, and writes them to disk.
 *
 * @param templateModuleInternal
 * @param templateProps
 * @param pluginRenderTemplates
 */
export const generateResponses = async (
  templateModuleInternal: TemplateModuleInternal<any, any>,
  templateProps: TemplateProps,
  pluginRenderTemplates: PluginRenderTemplates
): Promise<GeneratedPage> => {
  if (templateModuleInternal.transformProps) {
    templateProps = await templateModuleInternal.transformProps(templateProps);
  }

  const path = templateModuleInternal.getPath(templateProps);
  if (!path) {
    throw new Error(
      `getPath does not return a valid string in template '${templateModuleInternal.templateName}'`
    );
  }

  const templateRenderProps: TemplateRenderProps = {
    ...templateProps,
    path: path,
    relativePrefixToRoot: getRelativePrefixToRootFromPath(path),
  };

  const content = await renderHtml(
    templateModuleInternal,
    templateRenderProps,
    pluginRenderTemplates
  );

  return {
    content,
    path: path,
    redirects: templateModuleInternal.getRedirects?.(templateRenderProps) ?? [],
  };
};

/**
 * Checks the render and default export of a module and determines which to use to render html
 * content. The determination is made with the following rules:
 * 1. If module exports a default export and a render function, use the render function
 * 2. If a module exports a default export or a render function, use whatever is exported
 * 3. If a module doesn't export either, throw an error.
 */
const renderHtml = async (
  templateModuleInternal: TemplateModuleInternal<any, any>,
  props: TemplateRenderProps,
  pluginRenderTemplates: PluginRenderTemplates
) => {
  const { default: component, render, getHeadConfig } = templateModuleInternal;
  if (!component && !render) {
    throw new Error(
      `Cannot render html from template '${templateModuleInternal.config.name}'. Template is missing render function or default export.`
    );
  }

  if (render) {
    if (getHeadConfig) {
      console.warn(
        `getHeadConfig for template ${templateModuleInternal.config.name} will not be called since a custom render function is defined.`
      );
    }

    return render(props);
  }

  return await reactWrapper(
    props,
    templateModuleInternal,
    templateModuleInternal.config.hydrate,
    pluginRenderTemplates
  );
};
