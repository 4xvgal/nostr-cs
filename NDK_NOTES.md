# NDK 3.0.3 API 메모

`@nostr-dev-kit/ndk@3.0.3` 설치판의 `dist/index.d.ts` 로부터 확인한 시그니처 모음.
v7.1 스펙 대비 **괴리 지점** 은 하단 표에. 어댑터는 이 문서를 기준으로 작성.

## 확인된 시그니처

### NIP-17 gift wrap

```ts
type GiftWrapParams = {
  scheme?: NDKEncryptionScheme
  rumorKind?: number
  wrapTags?: string[][]
}
declare function giftWrap(
  event: NDKEvent,
  recipient: NDKUser,
  signer?: NDKSigner,
  params?: GiftWrapParams,
): Promise<NDKEvent>
declare function giftUnwrap(
  event: NDKEvent,
  sender?: NDKUser,
  signer?: NDKSigner,
  scheme?: NDKEncryptionScheme,
): Promise<NDKEvent>
```

AI guardrail: rumor 는 **서명 없이** 전달. 래퍼의 `created_at` 말고 rumor 것을 써라.

### NIP-65 relay list

```ts
declare function getRelayListForUser(pubkey: Hexpubkey, ndk: NDK): Promise<NDKRelayList>
```

`NDKRelayList.forUser(user, ndk)` **정적 메서드 없음** — 스펙 §12.3 에서 쓰지만 실제 API 는 이 named function. 첫 인자는 `Hexpubkey`(문자열).

`NDKRelayList` 인스턴스 getter: `readRelayUrls` / `writeRelayUrls` / `bothRelayUrls`.

### NDKSigner encrypt/decrypt

```ts
interface NDKSigner {
  encrypt(recipient: NDKUser, value: string, scheme?: NDKEncryptionScheme): Promise<string>
  decrypt(sender:    NDKUser, value: string, scheme?: NDKEncryptionScheme): Promise<string>
}
```

스펙 §12.2 의 `nip44Encrypt/nip44Decrypt` 는 **존재하지 않음** — `encrypt(user, value, 'nip44')` 로 교체.

### NDKPrivateKeySigner

```ts
declare class NDKPrivateKeySigner implements NDKSigner {
  constructor(privateKeyOrNsec: Uint8Array | string, ndk?: NDK)
  static generate(): NDKPrivateKeySigner
}
```

nsec/hex 모두 단일 문자열 인자로 처리됨 (`@ai-guardrail`). 스펙 §12.5 의 `{ type, value }` 는 value 만 넘기면 됨.

### NDKNip46Signer

```ts
declare class NDKNip46Signer extends EventEmitter implements NDKSigner {
  constructor(
    ndk: NDK,
    userOrConnectionToken?: string | false,
    localSigner?: NDKPrivateKeySigner | string,
    relayUrls?: string[],
    nostrConnectOptions?: NostrConnectOptions,
  )
  static bunker(ndk: NDK, userOrConnectionToken?: string, localSigner?: NDKPrivateKeySigner | string): NDKNip46Signer
  static nostrconnect(ndk: NDK, relay: string, localSigner?, nostrConnectOptions?): NDKNip46Signer
  blockUntilReady(): Promise<NDKUser>
}
```

정적 팩토리가 권장 (bunker:// vs nostrconnect:// 분기) — 이번 라운드는 ctor 3-인자 형태로 시작.

### NDKPool — disconnect 없음

`NDKPool` 클래스에 `disconnect()` 메서드 **없음**. d.ts 라인 659의 `declare function disconnect(pool, debug?)` 는 AuthPolicy 팩토리 (동명이인), 우리가 원하는 "풀 종료" 가 아님.

`ndk.pool.relays: Map<string, NDKRelay>` 를 순회 + `NDKRelay.disconnect(): void` (라인 896/1323) 호출해야 함.

### NDKSubscription

```ts
// sub.on('event', cb) 의 cb 시그니처
event: (event: NDKSignedEvent, relay: NDKRelay | undefined, sub: NDKSubscription, fromCache: boolean, optimisticPublish: boolean) => void
```

`NDKSignedEvent = NDKEvent & { ... }` — `.id/.pubkey/.kind/.tags/.content/.created_at/.sig` 모두 접근 가능. 어댑터에서 `(ev) => {...}` 1-인자 callback 으로 받으면 TS 가 허용.

### NDK.subscribe

```ts
subscribe(
  filters: NDKFilter | NDKFilter[],
  opts?: NDKSubscriptionOptions,
  autoStartOrRelaySet?: NDKRelaySet | boolean | NDKSubscriptionEventHandlers,
  _autoStart?: boolean,
): NDKSubscription
```

3번째 인자로 `NDKRelaySet` 직접 전달 가능 (스펙 §12.1 과 호환).

## 스펙 대비 괴리 — 어댑터 구현 방침

| 스펙 인용 | 실제 API | 어댑터 처리 |
|-----------|---------|-------------|
| `signer.nip44Encrypt(user, plain)` (§12.2) | `signer.encrypt(user, plain, 'nip44')` | `NDKCryptoAdapter` 에서 교체 |
| `signer.nip44Decrypt(user, cipher)` (§12.2) | `signer.decrypt(user, cipher, 'nip44')` | 동상 |
| `giftWrap(rumor, recipient, signer)` (§12.2) | 시그니처 동일 (+ optional `params?`) | 스펙 그대로 |
| `giftUnwrap(wrap, user, signer)` (§12.2) | 시그니처 동일 (+ optional `scheme?`) | 스펙 그대로 |
| `NDKRelayList.forUser(user, ndk)` (§12.3) | **없음** — `getRelayListForUser(pubkey, ndk)` | `NDKProfileAdapter.fetchRelaySet` 에서 pubkey 문자열 직접 전달 |
| `ndk.pool.disconnect()` (§14) | **없음** | `for (const r of ndk.pool.relays.values()) r.disconnect()` |
| `NDKPrivateKeySigner(value)` (§12.5) | `constructor(privateKeyOrNsec: Uint8Array\|string, ndk?)` | 스펙대로 value 만 넘기면 nsec/hex 모두 처리 |
| `NDKPrivateKeySigner.generate()` (§12.5) | static 메서드로 존재 | `NIP46KeyProvider` localSigner 기본값 |
| `NDKNip46Signer(ndk, connToken, local)` (§12.5) | `(ndk, userOrConnectionToken?, localSigner?, relayUrls?, opts?)` | 3-인자 호출 유지 |
| `sub.on('event', (ev) => ...)` (§12.1) | callback 은 실제 5-인자이나 TS 가 여분 허용 | 스펙대로 1-인자 |
| `NDKFilter` 의 `'#p'`, `'#R'` 등 (§12.1, §12.4) | lowercase 지원, uppercase 는 any-cast 필요 | 스펙 §12.4 그대로 `(filter as any)['#R']` |
