// Native Windows launcher uses next start; Docker production opts into standalone.
export default {...(process.env.HG_BUILD_STANDALONE==='true' ? {output:'standalone',outputFileTracingRoot:'/project',turbopack:{root:'/project'}} : {}),experimental:{cpus:1}};
