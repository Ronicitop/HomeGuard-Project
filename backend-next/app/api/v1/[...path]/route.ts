import {handleApi} from '../../../../lib/http/router';
export const dynamic='force-dynamic';
export const runtime='nodejs';
async function handler(request:Request,context:{params:Promise<{path:string[]}>}){return handleApi(request,(await context.params).path||[]);}
export {handler as GET,handler as POST,handler as PUT,handler as PATCH,handler as DELETE,handler as OPTIONS};
