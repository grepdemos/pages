import { ViteDevServer } from "vite";
import { TemplateModuleInternal } from "../../../common/src/template/internal/types.js";
import {
  RenderTemplate,
  TemplateRenderProps,
} from "../../../common/src/template/types.js";
import { getLang } from "../../../common/src/template/head.js";
import { Response } from "express-serve-static-core";
import { getContentType } from "./getContentType.js";
import { getGlobalClientServerRenderTemplates } from "../../../common/src/template/internal/getTemplateFilepaths.js";
import { ProjectStructure } from "../../../common/src/project/structure.js";
import {
  getHydrationTemplateDev,
  getServerTemplateDev,
} from "../../../common/src/template/hydration.js";

/**
 * Renders the HTML for a given {@link TemplateModuleInternal}
 * and {@link TemplateRenderProps}, and sends it back to the Response.
 */
export default async function sendAppHTML(
  res: Response,
  templateModuleInternal: TemplateModuleInternal<any, any>,
  props: TemplateRenderProps,
  vite: ViteDevServer,
  pathname: string,
  projectStructure: ProjectStructure
) {
  if (templateModuleInternal.render) {
    res
      .status(200)
      .type(getContentType(templateModuleInternal, props))
      .end(templateModuleInternal.render(props));
    return;
  }

  const clientServerRenderTemplates = getGlobalClientServerRenderTemplates(
    projectStructure.getTemplatePaths()
  );

  const serverRenderTemplateModule = (await vite.ssrLoadModule(
    clientServerRenderTemplates.serverRenderTemplatePath
  )) as RenderTemplate;

  const getServerHtml = async () => {
    // using this wrapper function prevents SRR client-server mistmatches if
    // the template modifies props
    return await serverRenderTemplateModule.render({
      Page: templateModuleInternal.default!,
      pageProps: props,
    });
  };

  const headConfig = templateModuleInternal.getHeadConfig
    ? templateModuleInternal.getHeadConfig(props)
    : undefined;

  const clientHydrationString = getHydrationTemplateDev(
    clientServerRenderTemplates.clientRenderTemplatePath,
    templateModuleInternal.path,
    props,
    templateModuleInternal.config.hydrate
  );

  const clientInjectedServerHtml = getServerTemplateDev(
    clientHydrationString,
    await getServerHtml(),
    getLang(headConfig, props),
    headConfig
  );

  const html = await vite.transformIndexHtml(
    // vite decodes request urls when caching proxy requests so we have to
    // load the transform request with a decoded uri
    decodeURIComponent(pathname),
    clientInjectedServerHtml
  );

  // Send the rendered HTML back.
  res.status(200).type(getContentType(templateModuleInternal, props)).end(html);
}
