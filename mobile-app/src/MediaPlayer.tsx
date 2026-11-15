import {useVideoPlayer,VideoView} from 'expo-video';
import {View,Text,StyleSheet} from 'react-native';
// A returns an authenticated, short-lived HLS/content URL. Only one full player is mounted.
export function MediaPlayer({url,token}:{url:string;token:string}){
 const player=useVideoPlayer({uri:url,headers:{Authorization:`Bearer ${token}`}},p=>{p.play();});
 return <View><VideoView player={player} style={styles.video} fullscreenOptions={{enable:true}} nativeControls/><Text>La reproducción depende de la conexión y del servicio de medios.</Text></View>;
}
const styles=StyleSheet.create({video:{height:220,width:'100%',backgroundColor:'#102c29',borderRadius:14}});
