/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
    EventCollection,
    EventType,
    IAvailableEvent,
    IEvenStoreConfig, IEventHandlerGroup, IListStreamSubscription,
    IStartRevision,
    ITemplateEvent,
    Method,
    PersistentSubscription,
    EventStoreDBClient,
    bigInt,
    END,
    persistentSubscriptionSettingsFromDefaults,
    jsonEvent
} from "../core/global";


const EventHandler = (mongoose: any) => {
    const _EventCollection = EventCollection(mongoose);
    return class _EventHandler {
        protected methods: Method;
        protected streamName: string[];
        protected group: string;
        protected credentials: IEvenStoreConfig["credentials"];
        private client: EventStoreDBClient;
        private StartRevision: IStartRevision;
        private stream: IListStreamSubscription;

        constructor(EvenStoreConfig: IEvenStoreConfig, group: IEventHandlerGroup = 'dispatch') {
            this.group = group;
            this.client = new EventStoreDBClient(
                EvenStoreConfig.connexion,
                EvenStoreConfig.security,
                EvenStoreConfig.credentials);
            this.init().catch((err) => {
                console.log('Error Constructor._EventHandler', err);
            })
        }

        private async init() {
            this.StartRevision = {};
            this.stream = {};
            const availableEvent: IAvailableEvent[] = await _EventCollection.find({
                Active: {$ne: false},
                Service: true
            }).select([
                'StreamName',
                'Revision',
                'Service',
                'IsCreatedPersistent'
            ]).lean();
            this.streamName = availableEvent.map((event: IAvailableEvent) => event.StreamName);
            for (const EventStream of availableEvent) {
                this.StartRevision[EventStream.StreamName] = EventStream.Revision ? (bigInt(EventStream.Revision).add(1).valueOf() as unknown as bigint) : END;
                console.log(this.StartRevision[EventStream.StreamName], EventStream.Revision)
                const status = await this.CreatePersistentSubscription(
                    EventStream.StreamName,
                    EventStream.IsCreatedPersistent);
                if (status)
                    this.stream[EventStream.StreamName] = this.SubscribeToPersistent(EventStream.StreamName);
            }
            Object.keys(this.stream).forEach((name: string) => this.dispatcher(this.stream[name]))
            console.log(this.stream);
            console.log(availableEvent);
        }

        private async dispatcher(subscription: PersistentSubscription) {
            for await (const resolvedEvent of subscription) {
                const {event} = resolvedEvent;
                console.log('Resolved Event --->', event);
                if (event) {
                    await this.handler(event);
                    await subscription.ack(resolvedEvent);
                    await _EventCollection.updateOne({StreamName: event.streamId}, {
                        Revision: event.revision,
                        UpdateDate: new Date()
                    }).exec()
                }
            }
        }

        private async handler(event: any) {
            if (Array.isArray(event.metadata.causationRoute)) {
                console.log('EventHandler', event.metadata.causationRoute)
                const Routes = event.metadata.causationRoute;
                const nextRoute: string | undefined = Routes.shift();
                console.log('Nex Route', nextRoute)
                if (nextRoute) {
                    if (event.state === "error") {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.$causationId,
                            state: event.state,
                            causationRoute: null
                        });
                        console.log('send event to >', event.streamId, template);
                        await this.client.appendToStream(event.streamId, [template]).catch((err: any) => {
                            console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
                        })
                    } else {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.streamId,
                            state: Routes.length ? "processing" : "completed",
                            causationRoute: Routes
                        });
                        console.log('send event to >', nextRoute, template);
                        await this.client.appendToStream(nextRoute, [template]).catch((err: any) => {
                            console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                        })
                    }

                }
            } else {
                console.warn('BAD EVENT FORMAT', event)
            }
        }

        private template(type: EventType, data: any, metadata: ITemplateEvent) {
            return jsonEvent({
                type,
                data,
                metadata
            })
        }

        private SubscribeToPersistent(streamName: string) {
            return this.client.subscribeToPersistentSubscription(
                streamName,
                this.group
            )
        }

        private async CreatePersistentSubscription(streamName: string, exist: boolean = false): Promise<boolean> {
            try {
                if (exist) await this.client.deletePersistentSubscription(streamName, this.group)
                await this.client.createPersistentSubscription(
                    streamName,
                    this.group,
                    persistentSubscriptionSettingsFromDefaults({
                        startFrom: this.StartRevision[streamName],
                        resolveLinkTos: true
                    }),
                    {credentials: this.credentials}
                )
                if (!exist) await _EventCollection.updateOne({
                    StreamName: streamName,
                    IsCreatedPersistent: true
                }).exec();
                return true;
            } catch (err) {
                console.error('Error EventHandler.CreatePersistentSubscription', err);
                return false;
            }
        }
    }
}

export default EventHandler
