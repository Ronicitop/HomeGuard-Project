export class AppError extends Error{
 constructor(public status:number,public code:string,message:string,public details?:unknown){super(message);this.name='AppError';}
}
export function fail(status:number,code:string,message:string,details?:unknown):never{throw new AppError(status,code,message,details);}
