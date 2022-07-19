/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 19/07/2022
 **  @Description
 ***********************************************************/
import {ModelEventWrapper} from "../client";
import {EventParser} from "./CommonResponse";

export class HandleResponse<CustomSchema> {
    private _isError = false;
    private readonly _payload : CustomSchema | CustomSchema;
    private _request_id : string;
    private readonly _eventDataRaw : EventParser<CustomSchema>
    constructor(eventResult : {
        data: ModelEventWrapper,
        request_id: string,
        error?:any,
    }) {
        this._request_id = eventResult.request_id;
        if (eventResult.error) {
            this._isError = true;
            this._payload = eventResult.error;
        } else {
            this._eventDataRaw = new EventParser(eventResult.data, null)
            if (this._eventDataRaw.state === "error") {
                this._isError = true;
            }
            this._payload =  this._eventDataRaw.data.data;
        }
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
