/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 19/07/2022
 **  @Description
 ***********************************************************/
import {IMethodFunctionResponse} from "../client";
import {IEventResponseSuccess, IMetadata} from "./global";

export class HandleResponse<CustomSchema> {
    private readonly _isError : boolean = false;
    private readonly _payload : CustomSchema | CustomSchema;
    private readonly _request_id : string;
    private readonly _state : IMetadata<any>['state']
    private readonly _eventDataRaw : IEventResponseSuccess<CustomSchema>['data']
    constructor(eventResult :IMethodFunctionResponse) {
        this._request_id = eventResult.request_id;
        if (!!eventResult.error) {
            this._isError = true;
            this._payload = eventResult.error;
        } else {
            this._eventDataRaw = eventResult.data;
            if (this._eventDataRaw.state === "error") {
                this._isError = true;
            }
            this._payload =  this._eventDataRaw.data;
        }
        if (this._isError) this._state = 'error';

    }

    get request_id() {
        return this._request_id;
    }


    get raw_result() {
        return this._eventDataRaw;
    }

    get payload() {
        return this._payload;
    }

}
