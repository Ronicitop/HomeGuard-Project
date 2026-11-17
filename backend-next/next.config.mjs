// Native Windows launcher uses next start; Docker production opts into standalone.
export default {output:process.env.HG_BUILD_STANDALONE==='true'?'standalone':undefined,experimental:{cpus:1}};
