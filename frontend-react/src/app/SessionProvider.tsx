import {createContext,useContext,useEffect,useState} from 'react';
import type {ReactNode} from 'react';
import type {UserView} from '../../../contracts/types';
import {api,setCsrfToken} from '../shared/api';
type Session={user:UserView|null;loading:boolean;error:string;signIn:(email:string,password:string)=>Promise<void>;signOut:()=>Promise<void>};
const Context=createContext<Session|null>(null);
export function SessionProvider({children}:{children:ReactNode}){
 const [user,setUser]=useState<UserView|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{let active=true;localStorage.removeItem('homeguard_user');
  api.get<UserView>('/auth/me').then(value=>{if(active){setUser(value);setCsrfToken(value.csrf_token||'');}}).catch(e=>{if(active&&e.status!==401)setError(e.message);}).finally(()=>{if(active)setLoading(false);});
  const expired=()=>{setUser(null);setCsrfToken('');};window.addEventListener('hg:session-expired',expired);return()=>{active=false;window.removeEventListener('hg:session-expired',expired);};
 },[]);
 async function signIn(email:string,password:string){const result=await api.post<{user:UserView;csrf_token:string}>('/auth/login',{email,password,platform:'web'});setCsrfToken(result.csrf_token);setUser(result.user);setError('');}
 async function signOut(){await api.post('/auth/logout');setCsrfToken('');setUser(null);}
 return <Context.Provider value={{user,loading,error,signIn,signOut}}>{children}</Context.Provider>;
}
export function useSession(){const ctx=useContext(Context);if(!ctx)throw new Error('SessionProvider required');return ctx;}
