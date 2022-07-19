/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 19/07/2022
 **  @Description
 ***********************************************************/
import { IMethodFunctionResponse } from "../client";
export declare class HandleResponse<CustomSchema> {
    private _isError;
    private readonly _payload;
    private readonly _request_id;
    private readonly _state;
    private readonly _eventDataRaw;
    constructor(eventResult: IMethodFunctionResponse);
    get request_id(): string;
    get raw_result(): any;
    get payload(): CustomSchema;
}
