/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 13/07/2022
 **  @Description
 ***********************************************************/
import {ICausationId, ICausationRoute, IEventResponseError, IEventResponseSuccess, IMetadata} from "./global";

export interface IEventCreate extends IEventResponseSuccess<any> {
    [key: string]: any;
}

export class EventParser<CustomSchema> {

    public readonly isError: boolean = false;
    public readonly updatedFields: keyof CustomSchema[];
    private readonly Metadata: IMetadata<any>;
    private readonly payload: any;
    private readonly _next_route: ICausationId | undefined;
    private readonly causationId: string;
    public readonly causationRoute: ICausationRoute;


    constructor(eventData: IEventCreate, metadata: IMetadata<CustomSchema>) {
        this.Metadata = metadata;
        this.causationRoute = metadata.causationRoute;
        console.log('state', this.state, 'route', this.causationRoute, metadata);
        if (this.state === 'error') {
            this.isError = true;
        } else if (this.state === 'processing') {
            console.log('State processing')
            if (this.causationRoute && Array.isArray(this.causationRoute)) {
                console.log('Causation route processing', this.causationRoute)
                this._next_route = this.Metadata.causationRoute[0];
                this._routes = this.Metadata.causationRoute.splice(0, 1);
                if (!this._next_route) this.Metadata.state = 'completed';
            }
        }
        this.payload = eventData.data;
        // @ts-ignore
        this.updatedFields = eventData.updatedFields;
        this.causationId = metadata.$causationId;
    }

    get causation() {
        return this.causationId;
    }

    private _routes: string[];

    get routes() {
        return this._routes;
    }

    set routes(routes: string[]) {
        this._routes = routes
    }

    get buildMetadata() : IMetadata<CustomSchema> {
        if (this.isError) return {...this.Metadata, causationRoute: []}
        else return {...this.Metadata, causationRoute : this.causationRoute}
    }


    get metadata(): IMetadata<CustomSchema> {
        if (this.isError) return {...this.Metadata, causationRoute: []}
        else return {...this.Metadata, causationRoute : this._routes}
    }

    get data(): IEventResponseError | IEventResponseSuccess<CustomSchema> {
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
