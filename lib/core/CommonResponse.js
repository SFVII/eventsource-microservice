"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventParser = void 0;
class EventParser {
    constructor(ResolvedEvent) {
        this.isError = false;
        this.causationRoute = [];
        this._causationRoute = [];
        const eventData = { ...ResolvedEvent.event };
        const { metadata } = eventData;
        this.Metadata = metadata || {};
        this._type = eventData.type;
        this._model = (eventData.model ? eventData.model : (eventData.data.model ? eventData.data.model : null));
        //this._type = (eventData.type ? eventData.type : (eventData.data.type ? eventData.data.type : null))
        this._status = (eventData.status ? eventData.status : (eventData.data.status ? eventData.data.status : null));
        this._customs = (eventData.customs ? eventData.customs : (eventData.data.customs ? eventData.data.customs : null));
        delete eventData.data.model;
        delete eventData.data.type;
        delete eventData.data.status;
        delete eventData.data.origin;
        delete eventData.data.customs;
        this.causationRoute = [...metadata.causationRoute];
        this._causationRoute = [...metadata.causationRoute];
        console.log('state', this.state, 'route', this.causationRoute, metadata);
        if (this.state === 'error') {
            this.isError = true;
        }
        else if (this.state === 'processing') {
            console.log('State processing');
            if (this.causationRoute && Array.isArray(this.causationRoute)) {
                console.log('Causation route processing', this.causationRoute);
                this._next_route = this._causationRoute.shift();
                if (!this._next_route)
                    this.Metadata.state = 'completed';
            }
        }
        this.payload = { ...(eventData.data && eventData.data.data ? eventData.data.data : eventData.data) };
        // @ts-ignore
        this.updatedFields = eventData.updatedFields;
        this.causationId = metadata?.$causationId;
    }
    get type() {
        return this._type;
    }
    get model() {
        return this._model;
    }
    get causation() {
        return this.causationId;
    }
    get customs() {
        return this._customs;
    }
    get routes() {
        return this._causationRoute;
    }
    set routes(routes) {
        this._causationRoute = routes;
    }
    get buildMetadata() {
        if (this.isError)
            return { ...this.Metadata, causationRoute: [] };
        else
            return { ...this.Metadata, causationRoute: this.causationRoute };
    }
    get metadata() {
        if (this.isError)
            return { ...this.Metadata, causationRoute: [] };
        else
            return { ...this.Metadata, causationRoute: this._causationRoute };
    }
    get data() {
        return this.isError ? {
            data: null,
            origin: this.metadata.$causationId,
            status: "error",
            type: this.metadata.typeOrigin,
            model: this.model,
            customs: this.customs,
            message: this.payload
        } : {
            origin: this.metadata.$causationId,
            data: this.payload,
            status: "success",
            model: this.model,
            customs: this.customs,
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
