export type Sleep = (ms: number) => Promise<void>

export class OnePerSecondQueue {
  private tail: Promise<void> = Promise.resolve()
  private readonly now: () => number
  private readonly sleep: Sleep
  private readonly minGapMs: number
  private readonly loadLastStartedAt: () => Promise<number | null | undefined>
  private readonly saveLastStartedAt: (value: number) => Promise<void>

  constructor(input: {
    now?: () => number
    sleep?: Sleep
    minGapMs?: number
    loadLastStartedAt: () => Promise<number | null | undefined>
    saveLastStartedAt: (value: number) => Promise<void>
  }) {
    this.now = input.now ?? Date.now
    this.sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.minGapMs = input.minGapMs ?? 1000
    this.loadLastStartedAt = input.loadLastStartedAt
    this.saveLastStartedAt = input.saveLastStartedAt
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    const current = this.tail.then(async () => {
      const lastStartedAt = await this.loadLastStartedAt()
      if (typeof lastStartedAt === 'number' && Number.isFinite(lastStartedAt)) {
        const waitMs = Math.max(0, lastStartedAt + this.minGapMs - this.now())
        if (waitMs > 0) await this.sleep(waitMs)
      }
      const startedAt = this.now()
      await this.saveLastStartedAt(startedAt)
      return task()
    })

    this.tail = current.then(() => undefined, () => undefined)
    return current
  }
}
