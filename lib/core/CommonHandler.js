"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HandleResponse = void 0;
class HandleResponse {
    constructor(eventResult) {
        this._isError = false;
        this._request_id = eventResult.request_id;
        if (eventResult.error) {
            this._isError = true;
            this._payload = eventResult.error;
        }
        else {
            this._eventDataRaw = eventResult.data;
            if (this._eventDataRaw.state === "error") {
                this._isError = true;
            }
            this._payload = this._eventDataRaw.data;
        }
        if (this._isError)
            this._state = 'error';
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
exports.HandleResponse = HandleResponse;
