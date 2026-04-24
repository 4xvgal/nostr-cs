# NDK 3.0.3 API 메모 (다음 라운드 adapter 작성용 임시 문서)

`@nostr-dev-kit/ndk@3.0.3` 설치 후 `dist/index.d.ts` 확인.

## 확인된 export

| 심볼 | 상태 | 비고 |
|------|------|------|
| `type NDKSigner` | ✅ | `interface` (type export) |
| `NDKPrivateKeySigner` | ✅ | `new NDKPrivateKeySigner(key: Uint8Array\|string, ndk?)` — nsec/hex 단일 인자 |
| `NDKNip07Signer` | ✅ | |
| `NDKNip46Signer` | ✅ | `(ndk, connToken?, localSigner?, relayUrls?, opts?)` |
| `giftWrap`, `giftUnwrap` | ✅ | named function export |
| `NDKRelayList` | ✅ | |
| `NDKEvent`, `NDKFilter`, `NDKRelaySet`, `NDKSubscription`, `NDKPool`, `NDKKind` | ✅ | |

## 스펙과의 괴리 — adapter 라운드에서 보정

1. **`NDKSigner.nip44Encrypt/nip44Decrypt` 없음**
   실제 API: `encrypt(recipient: NDKUser, value: string, scheme?: 'nip04'|'nip44')`.
   → `NDKCryptoAdapter.encrypt/decrypt` 를 스펙 §12.2 대신 `signer.encrypt(user, plaintext, 'nip44')` 로 바꿔야.

2. **`NDKPrivateKeySigner` 생성자 인자 형태**
   스펙 §12.5는 `{ type: 'nsec'|'hex'; value: string }` 로 분기해 전달.
   실제는 단일 문자열이면 충분하므로 `new NDKPrivateKeySigner(input.value)` 는 그대로 동작.

3. **`NDKRelayList.forUser(user, ndk)` 호출 형태**
   설치판에 `getRelayListForUser` 도 named export 로 있음 — 둘 다 써볼 수 있으니 adapter 작성 시 실제 서명 재확인.

4. **`NDK.pool` 는 `readonly pool: NDKPool`** — `pool.disconnect()` 가 NDKPool 에 있는지는 adapter 라운드에서 재확인.

## 이번 라운드 영향

`KeyProvider.ts` 포트가 `import type { NDKSigner }` 만 하므로 **이번 라운드 컴파일에는 문제 없음**.
