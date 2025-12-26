export {
  createStateService,
  createInitialState,
  type StateService,
  type StateUpdate,
} from './StateService'

export {
  createMessageQueueService,
  type MessageQueueService,
  type QueuedMessage,
} from './MessageQueueService'

export {
  createAuthenticationService,
  type AuthenticationService,
} from './AuthenticationService'

export {
  createHomeServerService,
  HomeServerServiceTag,
  type HomeServerService,
} from './HomeServerService'

export {
  createClientRegistry,
  type ClientRegistry,
} from './ClientRegistry'

export {
  createMessageRouter,
  type MessageRouter,
  type RouteResult,
} from './MessageRouter'

export {
  handleMessage,
  type MessageResponse,
} from './MessageHandler'

export {
  createSessionServices,
  type SessionServices,
} from './SessionServices'

export {
  validateProtocolVersion,
  validateAndAuthenticate,
  setupConnection,
  initializeSessionIfNeeded,
  activateIfIdle,
  connectHomeServerIfNeeded,
  sendStatusMessage,
  reconnectIfActiveWithStoredUrl,
  removeConnectionIfExists,
  scheduleIdleCheckIfEmpty,
  processWebSocketMessage,
  routeHttpRequest,
  transitionToIdleIfEmpty,
  transitionToClosedIfIdle,
  authenticateAndCloseSession,
} from './ConnectionHandler'
