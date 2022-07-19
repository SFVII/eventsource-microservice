/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 13/07/2022
 **  @Description
 ***********************************************************/
import { ICausationRoute, IEventResponseError, IEventResponseSuccess, IMetadata } from "./global";
export interface IEventCreate extends IEventResponseSuccess<any> {
    [key: string]: any;
}
export declare class EventParser<CustomSchema> {
    readonly isError: boolean;
    readonly updatedFields: keyof CustomSchema[];
    private readonly Metadata;
    private readonly payload;
    private readonly _next_route;
    private readonly causationId;
    private readonly model;
    readonly causationRoute: ICausationRoute;
    constructor(eventData: IEventCreate, metadata: IMetadata<CustomSchema>);
    get causation(): string;
    private _routes;
    get routes(): string[];
    set routes(routes: string[]);
    get buildMetadata(): IMetadata<CustomSchema>;
    get metadata(): IMetadata<CustomSchema>;
    get data(): IEventResponseError | IEventResponseSuccess<CustomSchema>;
    get state(): string;
    set state(value: string);
    get nextRoute(): string | undefined;
}
