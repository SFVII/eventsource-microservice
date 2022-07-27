/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
    END,
    EventStoreDBClient,
    IEvenStoreConfig,
    IEventHandlerGroup,
    IListStreamSubscription,
    IStartRevision,
    ITemplateEvent,
    ITriggerList,
    jsonEvent,
    Method,
    PersistentSubscription,
    persistentSubscriptionSettingsFromDefaults
} from "../core/global";
import {EventParser} from "../core/CommonResponse";

class EventHandler {
    protected methods: Method;
    protected streamName: string[];
    protected group: string;
    protected streamList: string[];
    protected credentials: IEvenStoreConfig["credentials"];
    protected triggerOnComplete: ITriggerList[] = [];
    private client: EventStoreDBClient;
    private StartRevision: IStartRevision;
    private stream: IListStreamSubscription;

    constructor(EvenStoreConfig: IEvenStoreConfig,
                streamList: string[],
                triggerOnComplete: ITriggerList[] = [],
                group: IEventHandlerGroup = 'global-event-handler') {
        this.group = group;
        this.streamList = streamList;
        this.triggerOnComplete = triggerOnComplete || [];
        this.client = new EventStoreDBClient(
            EvenStoreConfig.connexion,
            EvenStoreConfig.security,
            EvenStoreConfig.credentials);
        this.init().catch((err) => {
            console.log('Error Constructor._EventHandler', err);
            process.exit(0);
        })
    }

    private async init() {
        this.StartRevision = {};
        this.stream = {};
        for (const stream of this.streamList) {
            console.log('subscribe to stream > %s', stream)
            this.StartRevision[stream] = END;
            await this.CreatePersistentSubscription(stream).catch((err: any) => console.warn('warning', err));
            this.stream[stream] = this.SubscribeToPersistent(stream);
        }
        Object.keys(this.stream).forEach((name: string) => this.dispatcher(this.stream[name]))
    }

    private async dispatcher(subscription: PersistentSubscription) {
        for await (const resolvedEvent of subscription) {
            const {event} = resolvedEvent;
            if (event) {
                // @ts-ignore
                if (event.metadata.state === "processing") await this.handler(resolvedEvent);
                await subscription.ack(resolvedEvent);
            }
        }
    }

    private async handler(event: any) {
        const eventParser = new EventParser<any>(event);
        const template = this.template(eventParser.type, eventParser.data, eventParser.metadata);

        console.log(
            'isError',
            eventParser.isError,
            'nextRoute',
            eventParser.nextRoute,
            'state',
            eventParser.state,
            'template',
            template
        )

        if (eventParser.isError) await this.client.appendToStream(eventParser.causation, [template])
            .catch((err: any) => {
                console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
            });
        else if (eventParser.nextRoute) await this.client.appendToStream(eventParser.nextRoute, [template])
            .catch((err: any) => {
                console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
            })
        else await this.client.appendToStream(eventParser.causation, [template])
                .catch((err: any) => {
                    console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
                })
    }

    private template(type: string, data: any, metadata: ITemplateEvent<any>) {
        return jsonEvent({
            type,
            data,
            metadata
        })
    }

    private SubscribeToPersistent(streamName: string) {
        return this.client.subscribeToPersistentSubscription(
            streamName,
            this.group,
            {
                bufferSize: 10
            }
        )
    }

    private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
        try {
            await this.client.createPersistentSubscription(
                streamName,
                this.group,
                persistentSubscriptionSettingsFromDefaults({
                    startFrom: this.StartRevision[streamName],
                    resolveLinkTos: true
                }),
                {credentials: this.credentials}
            )
            return true;
        } catch (err) {
            const error = (err ? err.toString() : "").toLowerCase();
            if (error.includes('EXIST') || error.includes('exist')) {
                console.log('Persistent subscription %s already exist', streamName)
                return true;
            } else console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
        }
    }
}

export default EventHandler
