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
    readonly updatedFields: keyof CustomSchema[] | [];
    readonly causationRoute: ICausationRoute;
    private readonly _origin;
    private readonly Metadata;
    private readonly payload;
    private readonly _next_route;
    private readonly causationId;
    private readonly _model;
    private readonly _type;
    private readonly _status;
    private readonly _customs;
    private _causationRoute;
    private readonly _correlation_id;
    constructor(ResolvedEvent: {
        event: {
            data: any;
            metadata: IMetadata<any>;
            [key: string]: any;
        };
        [key: string]: any;
    }, handler?: boolean);
    get correlationId(): string;
    get origin(): string;
    get type(): string;
    get model(): any;
    get causation(): string;
    get customs(): any;
    get routes(): string[];
    set routes(routes: string[]);
    get buildMetadata(): IMetadata<CustomSchema>;
    get metadata(): IMetadata<CustomSchema>;
    get data(): IEventResponseError | IEventResponseSuccess<CustomSchema>;
    get state(): string;
    set state(value: string);
    get nextRoute(): string | undefined;
}
