"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventParser = void 0;
class EventParser {
    constructor(eventData, metadata) {
        this.isError = false;
        if (metadata.state === 'error') {
            this.isError = true;
        }
        else if (metadata.state === 'processing') {
            if (metadata.causationRoute && Array.isArray(metadata.causationRoute)) {
                this._next_route = metadata.causationRoute.shift();
                this._routes = metadata.causationRoute;
                if (!(this._routes && this._routes.length))
                    metadata.state = 'completed';
            }
        }
        this.payload = eventData.data;
        // @ts-ignore
        this.updatedFields = eventData.updatedFields;
        this.Metadata = metadata;
        this.causationId = metadata.$causationId;
    }
    get causation() {
        return this.causationId;
    }
    get routes() {
        return this._routes;
    }
    set routes(routes) {
        this._routes = routes;
    }
    get metadata() {
        if (this.isError)
            return { ...this.Metadata, causationRoute: [] };
        else
            return this.Metadata;
    }
    get data() {
        return this.isError ? {
            data: null,
            origin: this.metadata.$causationId,
            status: "error",
            type: this.metadata.typeOrigin,
            message: this.payload
        } : {
            origin: this.metadata.$causationId,
            data: this.payload,
            status: "success",
            type: this.metadata.typeOrigin,
            updatedFields: this.updatedFields
        };
    }
    get state() {
        return this.Metadata.state;
    }
    set state(value) {
        this.Metadata.state = value;
    }
    get nextRoute() {
        return this._next_route;
    }
}
exports.EventParser = EventParser;
