import type {ReactNode} from 'react';
import {BrowserRouter,Routes,Route,Link} from 'react-router-dom';
import {useSession,SessionProvider} from './SessionProvider';
import {AppShell} from './AppShell';
import {LoginPage} from './LoginPage';
import {IntegrationPage} from './IntegrationPage';
import {DashboardPage} from '../features/home/DashboardPage';
import {EventsPage} from '../features/events/EventsPage';
import {EventDetail} from '../features/events/EventDetail';
import {SecurityPage} from '../features/security/SecurityPage';
import {EmergenciesPage} from '../features/emergencies/EmergenciesPage';
import {IncidentDetail} from '../features/emergencies/IncidentDetail';
import {OperatorConsole} from '../features/emergencies/OperatorConsole';
import {SettingsPage} from '../features/settings/SettingsPage';
import {Loading,Notice} from '../shared/ui';
function Allowed({children,admin=false}:{children:ReactNode;admin?:boolean}){const {user}=useSession();if(user?.rol==='INVITADO'||admin&&user?.rol!=='ADMINISTRADOR')return <Notice>Esta sección requiere permisos adicionales. <Link to="/">Volver al resumen</Link></Notice>;return children;}
function Screens(){const {user,loading}=useSession();if(loading)return <main className="boot-screen"><Loading/></main>;if(!user)return <LoginPage/>;return <Routes><Route element={<AppShell/>}><Route index element={<DashboardPage/>}/><Route path="cameras" element={<Allowed><IntegrationPage kind="cameras"/></Allowed>}/><Route path="people" element={<Allowed><IntegrationPage kind="people"/></Allowed>}/><Route path="movements" element={<Allowed><IntegrationPage kind="movements"/></Allowed>}/><Route path="events" element={<Allowed><EventsPage/></Allowed>}/><Route path="events/:id" element={<Allowed><EventDetail/></Allowed>}/><Route path="security" element={<Allowed><SecurityPage/></Allowed>}/><Route path="emergencies" element={<Allowed><EmergenciesPage/></Allowed>}/><Route path="emergencies/:id" element={<Allowed><IncidentDetail/></Allowed>}/><Route path="operator" element={<Allowed admin><OperatorConsole/></Allowed>}/><Route path="settings" element={<Allowed><SettingsPage/></Allowed>}/><Route path="*" element={<Notice>No se encontró esta página. <Link to="/">Volver al resumen</Link></Notice>}/></Route></Routes>;}
export function AppRouter(){return <BrowserRouter><SessionProvider><Screens/></SessionProvider></BrowserRouter>;}
