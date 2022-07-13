/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 13/07/2022
 **  @Description
 ***********************************************************/
import {ICausationId, IEventResponseError, IEventResponseSuccess, IMetadata} from "./global";

export interface IEventCreate extends IEventResponseSuccess<any> {
    [key: string]: any;
}

export class EventParser<CustomSchema> {

    public readonly isError: boolean = false;
    public readonly originalState: IMetadata<CustomSchema>['state'];
    private readonly Metadata: IMetadata<any>;
    private readonly payload: any;
    private readonly _next_route: ICausationId | undefined;
    private readonly causationId: string;
    public readonly updatedFields: keyof CustomSchema[];

    constructor(eventData: IEventCreate, metadata: IMetadata<CustomSchema>) {
        if (metadata.state === 'error') {
            this.isError = true;
        } else if (metadata.state === 'processing') {
            if (metadata.causationRoute && Array.isArray(metadata.causationRoute)) {
                this._next_route = metadata.causationRoute.shift();
                this._routes = metadata.causationRoute;
                if (!(this._routes && this._routes.length)) metadata.state = 'completed';
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

    private _routes: string[];

    get routes() {
        return this._routes;
    }

    set routes(routes: string[]) {
        this._routes = routes
    }

    get metadata(): IMetadata<CustomSchema> {
        if (this.isError) return {...this.Metadata, causationRoute: []}
        else return this.Metadata
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
