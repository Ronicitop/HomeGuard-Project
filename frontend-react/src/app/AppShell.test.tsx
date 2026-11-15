import {test,expect,vi,afterEach} from 'vitest';
import {render,screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {SessionProvider} from './SessionProvider';
import {AppShell} from './AppShell';
afterEach(()=>vi.unstubAllGlobals());
function server(role:string){vi.stubGlobal('fetch',vi.fn(async(input:string)=>String(input).endsWith('/auth/me')?Response.json({id:1,nombre:'Admin',rol:role,csrf_token:'csrf'}):Response.json({counts:{total:0,new:0,security:0,emergency:0},mode:{mode:'AWAY',revision:1},active_incidents:[],items:[],services:[],integrations:{vision:false,push:false,voice:false},pending_jobs:0})));}
test('admin navigation exposes the B workflows and an operator console',async()=>{server('ADMINISTRADOR');render(<MemoryRouter><SessionProvider><AppShell/></SessionProvider></MemoryRouter>);expect(await screen.findByRole('link',{name:'Eventos'})).toBeInTheDocument();expect(screen.getByRole('link',{name:'Central simulada'})).toBeInTheDocument();});
test('a guest does not receive navigation to private event or operator screens',async()=>{server('INVITADO');render(<MemoryRouter><SessionProvider><AppShell/></SessionProvider></MemoryRouter>);expect(await screen.findByRole('link',{name:'Resumen'})).toBeInTheDocument();expect(screen.queryByRole('link',{name:'Eventos'})).not.toBeInTheDocument();expect(screen.queryByRole('link',{name:'Central simulada'})).not.toBeInTheDocument();});
