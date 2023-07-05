// TODO enable again when ESLint supports WebTransport
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */

import * as Stream from "./stream"
import * as Setup from "./setup"
import * as Control from "./control"
import { Objects } from "./object"
import { Connection } from "./connection"

export interface Config {
	url: string

	// Parameters used to create the MoQ session
	role: Setup.Role

	// If set, the server fingerprint will be fetched from this URL.
	// This is required to use self-signed certificates with Chrome (May 2023)
	fingerprint?: string
}

export async function connect(config: Config) {
	// Helper function to make creating a promise easier
	const options: WebTransportOptions = {}

	if (config.fingerprint) {
		try {
			const fingerprint = await fetchFingerprint(config.fingerprint)
			options.serverCertificateHashes = [fingerprint]
		} catch (e) {
			console.warn("failed to fetch fingerprint: ", e)
		}
	}

	const quic = new WebTransport(config.url, options)
	await quic.ready

	const stream = await quic.createBidirectionalStream()

	const writer = new Stream.Writer(stream.writable)
	const reader = new Stream.Reader(stream.readable)

	const setup = new Setup.Stream(reader, writer)

	// Send the setup message.
	await setup.send.client({ versions: [Setup.Version.DRAFT_00], role: config.role })

	// Receive the setup message.
	// TODO verify the SETUP response.
	const _server = await setup.recv.server()

	const control = new Control.Stream(reader, writer)
	const objects = new Objects(quic)

	return new Connection(quic, control, objects)
}

async function fetchFingerprint(url: string): Promise<WebTransportHash> {
	// TODO remove this fingerprint when Chrome WebTransport accepts the system CA
	const response = await fetch(url)
	const hexString = await response.text()

	const hexBytes = new Uint8Array(hexString.length / 2)
	for (let i = 0; i < hexBytes.length; i += 1) {
		hexBytes[i] = parseInt(hexString.slice(2 * i, 2 * i + 2), 16)
	}

	return {
		algorithm: "sha-256",
		value: hexBytes,
	}
}
