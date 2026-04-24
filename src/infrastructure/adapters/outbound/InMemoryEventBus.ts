import type { CSEvent, EventBusPort } from '../../../application/ports/outbound/EventBusPort.js'

type Handler = (payload: any) => void

export class InMemoryEventBus implements EventBusPort {
  private handlers = new Map<CSEvent['type'], Set<Handler>>()

  emit: EventBusPort['emit'] = (event) => {
    const set = this.handlers.get(event.type)
    if (!set) return
    for (const h of set) h(event.payload)
  }

  on: EventBusPort['on'] = (type, handler) => {
    let set = this.handlers.get(type)
    if (!set) {
      set = new Set()
      this.handlers.set(type, set)
    }
    const wrapped = handler as Handler
    set.add(wrapped)
    return () => {
      set!.delete(wrapped)
    }
  }
}
