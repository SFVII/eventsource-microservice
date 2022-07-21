/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 13/07/2022
 **  @Description
 ***********************************************************/
import {
    ICausationId,
    ICausationRoute,
    IEventResponseError,
    IEventResponseSuccess,
    IMetadata,
    ITypeOrigin
} from "./global";

export interface IEventCreate extends IEventResponseSuccess<any> {
    [key: string]: any;
}

export class EventParser<CustomSchema> {

    public readonly isError: boolean = false;
    public readonly updatedFields: keyof CustomSchema[] | [] = [];
    public readonly causationRoute: ICausationRoute = [];
    private readonly Metadata: IMetadata<any>;
    private readonly payload: any;
    private readonly _next_route: ICausationId | undefined;
    private readonly causationId: string;
    private readonly _model: any;
    private readonly _type: ITypeOrigin
    private readonly _status: IMetadata<any>['state'];
    private readonly _customs: any;
    private _causationRoute: ICausationRoute = [];

    constructor(ResolvedEvent: { event: { data: any, metadata: IMetadata<any>, [key: string]: any }, [key: string]: any }) {


        console.log('type', ResolvedEvent.event.type);

        this._type = ResolvedEvent.event.type;

        console.log('type 2', this._type);

        const eventData = {...ResolvedEvent.event};

        console.log('Event Data', eventData)
        const {metadata} = eventData;
        this.Metadata = metadata || {};

        this._model = (eventData.model ? eventData.model : (eventData.data.model ? eventData.data.model : null));
        //this._type = (eventData.type ? eventData.type : (eventData.data.type ? eventData.data.type : null))
        this._status = (eventData.status ? eventData.status : (eventData.data.status ? eventData.data.status : null))
        this._customs = (eventData.customs ? eventData.customs : (eventData.data.customs ? eventData.data.customs : null))


        delete eventData.data.model;
        delete eventData.data.type;
        delete eventData.data.status;
        delete eventData.data.origin;
        delete eventData.data.customs;


        this.causationRoute = metadata.causationRoute && metadata.causationRoute.length ? [...metadata.causationRoute] : [];
        this._causationRoute = metadata.causationRoute && metadata.causationRoute.length ? [...metadata.causationRoute] : [];
        console.log('state', this.state, 'route', this.causationRoute, metadata);


        if (this.state === 'error') {
            this.isError = true;
        } else if (this.state === 'processing') {
            console.log('State processing')
            if (this.causationRoute && Array.isArray(this.causationRoute)) {
                console.log('Causation route processing', this.causationRoute)
                this._next_route = this._causationRoute.shift();
                if (!this._next_route) this.Metadata.state = 'completed';
            }
        }
        this.payload = {...(eventData.data && eventData.data.data ? eventData.data.data : eventData.data)};
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

    set routes(routes: string[]) {
        this._causationRoute = routes
    }

    get buildMetadata(): IMetadata<CustomSchema> {
        if (this.isError) return {...this.Metadata, causationRoute: []}
        else return {...this.Metadata, causationRoute: this.causationRoute}
    }


    get metadata(): IMetadata<CustomSchema> {
        if (this.isError) return {...this.Metadata, causationRoute: []}
        else return {...this.Metadata, causationRoute: this._causationRoute}
    }

    get data(): IEventResponseError | IEventResponseSuccess<CustomSchema> {
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
        }
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
