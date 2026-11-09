/** No reviewed atomic correction/hash/restore RPC is available. No environment override. */
export function assertDirectMaintenanceDisabled(command:string):void {throw Error(command+': disabled pending an audited replacement workflow. No database or publisher request was made.');}
