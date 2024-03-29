/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
	EventEmitter,
	EventStoreDBClient,
	EventType,
	IEvenStoreConfig,
	IEventHandlerGroup,
	IQueue,
	IQueueCustom,
	IStartRevisionValues,
	ITemplateEvent,
	jsonEvent,
	Method,
	MethodList,
	PersistentSubscriptionBase,
	StreamSubscription
} from "../core/global";

import {
	END,
	JSONEventType,
	PARK,
	PersistentAction,
	PersistentSubscriptionToStream,
	persistentSubscriptionToStreamSettingsFromDefaults,
	ResolvedEvent,
	RETRY
}                    from "@eventstore/db-client";
import {EventParser} from "../core/CommonResponse";

const timerBeforeReboot = 1 * 1000 * 60;
class EventConsumer<Contributor> {
	public QueueTTL = 100;
	protected methods: Method;
	protected streamName: string;
	protected group: string;
	protected credentials: IEvenStoreConfig["credentials"];
	private eventEmitter = new EventEmitter();
	private client: EventStoreDBClient;
	private StartRevision: IStartRevisionValues | null;
	private stream: StreamSubscription;
	private readonly Queue: IQueue | IQueueCustom;
	private readonly publish: boolean;
	private readonly settings: IEvenStoreConfig['settings'];
	private readonly streamSettings: IEvenStoreConfig['streamSettings']
	private readonly overridePublishName!: string;

	constructor(EvenStoreConfig: IEvenStoreConfig,
	            StreamName: string,
	            queue: IQueue | IQueueCustom = {
		            create: [],
		            update: [],
		            delete: [],
		            recover: []
	            },
	            publish: boolean = false,
	            group: IEventHandlerGroup = 'consumers',
	            overridePublishName ?: string) {
		if (overridePublishName) this.overridePublishName = overridePublishName;
		this.publish = publish;
		this.Queue = {...queue, ...{worker: []}}
		this.streamName = StreamName;
		this.group = group;
		this.client = new EventStoreDBClient(
			EvenStoreConfig.connexion,
			EvenStoreConfig.security,
			EvenStoreConfig.credentials);
		this.settings = EvenStoreConfig.settings || {};
		this.streamSettings = EvenStoreConfig.streamSettings || {}
		this.init().catch((err) => {
			console.log('Error Constructor._EventHandler', err);
			setTimeout(() => {
				process.exit(1);
			}, timerBeforeReboot)
		})
	}

	get subscription(): PersistentSubscriptionToStream {
		return <PersistentSubscriptionBase<any>>this.stream;
	}

	on(key: 'ready' & MethodList & string, callback: (message: JSONEventType[]) => any) {
		this.eventEmitter.on(key, (msg: JSONEventType[]) => {
			console.log('key_consume : %s', key)
			const [type, main, sub_key] = (key as string).split('.');
			// @ts-ignore
			const queue_length = sub_key ? this.Queue[main][sub_key]?.length : this.Queue[main]?.length;
			console.log('/ \t\tPACKET\t\t  >\n\n Job Length %d  Queue Length %d \n\n< \t\tPACKET\t\t  / \n', msg.length, queue_length)
			setTimeout(() => {
				callback(msg), 200
			});
		})
	}

	public AddToQueue(type: MethodList, ResolvedEvent: JSONEventType, name?: string) {
		if (!Array.isArray(this.Queue[type]) && name && this.Queue && this.Queue[type]) {
			// @ts-ignore
			if (!this.Queue[type][name]) this.Queue[type][name] = [];
			// @ts-ignore
			this.Queue[type][name].push(ResolvedEvent)
		} else if (!name && this.Queue && this.Queue[type]) {
			// @ts-ignore
			this.Queue[type].push(ResolvedEvent);
		} else {
			console.log('Error _EventConsumer.AddToQueue Queue does not exist')
		}
		/*

		*/
	}

	public async handler(eventParse: EventParser<any>) {
		let publish: any = null;
		const reworkMetadata = {...eventParse.metadata, consumer_job_name: eventParse.nextRoute || this.streamName}
		// @ts-ignore
		if (!eventParse.isError && this.publish && eventParse.metadata.state !== "delivered") {
			const pMetadata = {
				...eventParse.metadata,
				state: 'delivered',
				consumer_job_name: eventParse.nextRoute || this.streamName
			}
			// @ts-ignore
			publish = this.template(eventParse.type, eventParse.data, pMetadata);
			this.client.appendToStream(this.overridePublishName ? this.overridePublishName : this.streamName + '-publish', [publish])
				.catch((err: any) =>
					console.error(`Error EventHandler.handler.appendToStream`, err))
		}
		const template = this.template(eventParse.type as EventType, eventParse.data, reworkMetadata);
		await this.client.appendToStream(eventParse.causation, [template]).catch((err: any) => {
			console.error(`Error EventHandler.handler.appendToStream`, err);
		})
	}

	public async ack(event: any) {
		await this.subscription.ack(event);
	}

	public async nack(event: any, type: PersistentAction = PARK, reason: string = 'default') {
		await this.subscription.nack(type, reason, event);
	}

	public async retry(event: any, reason: string = 'default') {
		await this.subscription.nack(RETRY, reason, event);
	}

	private Merge(Q: ResolvedEvent[], event: ResolvedEvent): number | false {
		const index = Q.findIndex(
			(e: ResolvedEvent) =>
				// @ts-ignore
				e.event?.metadata?.$correlationId &&
				// @ts-ignore
				event.event?.metadata?.$correlationId &&
				// @ts-ignore
				e.event?.metadata?.$correlationId === event.event?.metadata?.$correlationId
		);
		//  console.log('Duplicate detection ? %s', index > -1)
		return index > -1 ? index : false;
	}

	private async init() {
		await this.CreatePersistentSubscription(this.streamName);
		this.StartRevision = null;
		this.stream = this.SubscribeToPersistent(this.streamName);
		this.eventEmitter.emit('ready', true);
		this.QueueListener();
	}

	private QueueListener() {
		setInterval(() => {
			Object.keys(this.Queue).forEach((type: MethodList) => {
				// @ts-ignore
				if (!Array.isArray(this.Queue[type])) {
					// @ts-ignore
					if (this.Queue[type] && Object.keys(this.Queue[type]).length) {
						// @ts-ignore
						Object.keys(this.Queue[type]).forEach((subkey: string) => {
							// @ts-ignore
							if (this.Queue && this.Queue[type] && this.Queue[type][subkey]
								// @ts-ignore
								&& (this.Queue[type][subkey] as StreamSubscription[])?.length) {
								// @ts-ignore
								const stack = (this.Queue[type][subkey] as StreamSubscription[]).splice(
									0,
									// @ts-ignore
									((this.Queue[type][subkey])?.length >= 100 ? 100 : this.Queue[type][subkey]?.length)
								)
								this.eventEmitter.emit(type + '.' + subkey, stack);
							}
						})
					}
				} else {
					// @ts-ignore
					if (this.Queue && this.Queue[type] && (this.Queue[type] as StreamSubscription[])?.length) {
						const stack = (this.Queue[type] as StreamSubscription[]).splice(
							0,
							// @ts-ignore
							((this.Queue[type] as StreamSubscription[])?.length >= 100 ? 100 : this.Queue[type]?.length)
						)
						this.eventEmitter.emit(type, stack);
					}
				}
			});
		}, this.QueueTTL);
	}

	private SubscribeToPersistent(streamName: string) {
		return this.client.subscribeToPersistentSubscriptionToStream(
			streamName,
			this.group,
			{bufferSize: this.streamSettings?.bufferSize || 200}
		)
	}

	private template(type: EventType, data: any, metadata: ITemplateEvent<Contributor>) {
		return jsonEvent({
			type,
			data,
			metadata
		})
	}

	private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
		try {
			const subscription = await this.client.createPersistentSubscriptionToStream(
				streamName,
				this.group,
				persistentSubscriptionToStreamSettingsFromDefaults({
					startFrom: END,
					NamedConsumerStrategy: 'DispatchToSingle', ...this.settings
				}),
				{credentials: this.credentials}
			);
			return true;
		} catch (err) {
			const error = (err ? err.toString() : "").toLowerCase();
			if (error.includes('EXIST') || error.includes('exist')) {
				/*await this.client.updatePersistentSubscriptionToStream(
					streamName,
					this.group,
					persistentSubscriptionToStreamSettingsFromDefaults({startFrom: END, ...this.settings}),
					{credentials: this.credentials}
				)*/
				console.log('Persistent subscription %s already exist', streamName)
				return true;
			} else {
				const errorsReboot = ['CANCELLED', 'canceled', 'UNAVAILABLE'];
				for (const k of errorsReboot) {
					if (error.includes(k))  {
						console.log('calling pod reboot in %d ms', timerBeforeReboot)
						setTimeout(() => {
							process.exit(1);
						}, timerBeforeReboot)
					}
				}
			}
			return false;
		}
	}
}


export default EventConsumer
