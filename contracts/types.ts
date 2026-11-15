export type Role='ADMINISTRADOR'|'RESIDENTE'|'INVITADO';
export type Source='LIVE'|'REPLAY'|'SIMULATED';
export type Category='SECURITY'|'MOVEMENT'|'EMERGENCY'|'SYSTEM';
export type EventStatus='NEW'|'ACKNOWLEDGED'|'RESOLVED'|'FALSE_POSITIVE';
export type Severity='INFO'|'WARNING'|'CRITICAL';
export interface Actions{notify_enabled:boolean;save_clip_enabled:boolean;alarm_enabled:boolean;emergency_enabled:boolean}
export interface DetectionProposed{
 schema_version:'1.0';message_type:'detection.proposed.v1';message_id:string;event_id:string;household_id:string;camera_id:string;stream_session_id:string;rule_version_id:string;
 occurred_at:string;source:Source;event_type:string;category:Category;severity:Severity;summary:string;confidence:number;local_track_id:string;
 evidence:{observability:'VISIBLE'|'PARTIAL'|'LOST';frame_times_ms?:number[];snapshot_ref?:string|null;segment_hold_ref?:string|null;visible_from?:string;visible_until?:string;immobility_seconds?:number;pose_profile_id?:string};
 producer:{name:string;version:string;model_id:string;config_revision:number};
}
export interface EventView{id:string;household_id:string;camera_id:string|null;rule_version_id:string|null;source:Source;category:Category;event_type:string;severity:Severity;summary:string;confidence:number|null;occurred_at:string;received_at:string;status:EventStatus;decisions:Record<string,unknown>;evidence:Record<string,unknown>;revision:number;late:boolean;clip_status?:string}
export interface Page<T>{items:T[];next_cursor:string|null}
export type IncidentState='PENDING_RESPONSE'|'CANCELLED'|'ESCALATED'|'CALLING_SIMULATED'|'CONNECTED_SIMULATED'|'CLOSED'|'FAILED'|'NEEDS_REVIEW';
export interface IncidentView{id:string;event_id:string;state:IncidentState;state_revision:number;response_deadline:string;created_at:string;cancellation_requested:boolean;call?:{id:string;state:string;transcript:string;audio_status:string}|null}
export interface UserView{id:number;nombre:string;apellido:string;email:string;rol:Role;household_id:string;csrf_token?:string}
