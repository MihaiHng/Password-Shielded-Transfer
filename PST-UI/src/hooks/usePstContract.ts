import { JsonRpcProvider, FallbackProvider } from 'ethers'
import { useMemo } from 'react'
import type { Client } from 'wagmi'
import { useClient } from 'wagmi'

export function clientToProvider(client: Client) {
    const { chain, transport } = client
    const network = {
        chainId: chain.id,
        name: chain.name,
        ensAddress: chain.contracts?.ensRegistry?.address,
    }
    if (transport.type === 'fallback') {
        return new FallbackProvider(
            transport.transports.map(({ value }) => new JsonRpcProvider(value?.url, network))
        )
    }
    return new JsonRpcProvider(transport.url, network)
}

export function useEthersProvider({ chainId }: { chainId?: number } = {}) {
    const client = useClient({ chainId })
    return useMemo(() => (client ? clientToProvider(client) : undefined), [client])
}
