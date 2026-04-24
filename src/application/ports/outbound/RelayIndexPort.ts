export interface RelayIndexFilter {
  noPayment?: boolean
  noAuth?: boolean
  limit?: number
}

export interface RelayIndexPort {
  fetchPublicRelays(filter?: RelayIndexFilter): Promise<string[]>
}
