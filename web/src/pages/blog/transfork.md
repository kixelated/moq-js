# Transfork
The IETF process is a long burn.
I've flown out to X in-person meetings, attended Y remote meetings, left Z comments on Github, and even authored the original transport draft.
I've invested a lot of my limited time.

Unfortunately, this is the end of my involvement.
I don't think the MoQ working group will be able to accomplish its charter.
It's possible to design a experimental protocol via a committee, but not this one.

## Why
The core MoQ contributors consist of 5 people from Cisco and ~5 people from CDN companies, who want their business of course.
The focus has unsurprisingly been on the layer that the CDNs can sell: MoqTransport.

Unfortunately, the media layer (the M in MoQ) is woefully underspecified and frankly, nobody intends to implement it anyway.
There's no customer and no client outside of Cisco driving any of the transport design.
And Cisco has some bizarre requirements that are impossible to push back on, resulting in exceptions or undesirable behavior.

A concrete example: **sequential IDs**. 
Every sane internet transport uses sequential IDs so the receiver can detect gaps caused by loss.
Sequential IDs mean no gaps, so data can be served/rendered without waiting or querying upstream.
But no, the Cisco folks insist that there can be both explicit and implicit gaps; the equivalent of `null` and `undefined` in JavaScript.
It's an infuriating debate that has lasted years.

As a library maintainer, I struggle to explain how an application is supposed to use MoqTransport.
Read the latest draft and tell me how you're supposed to use MoQ to send media.
My answer is always "it depends" but it's now shifted into "get a job at Cisco".

## What Now
I still love the idea of using WebTransport and QUIC to deliver media.
When combined with WebCodecs, it's no longer required to use WebRTC for real-time media on browsers.

I also love the concept behind MoqTransport:
A generic transport for media-like applications.
It fixes many of the issues with WebRTC being too tightly coupled with the application.

To this end, I've forked MoqTransport as **MoqTransfork**.

It's an order of magnitude simpler and fufills more media use-cases.
There's no ambiguity: this is how you transmit in a codec and container agnostic way.

And if you want something even more opinionated: **Karp**. 
It's a layer on top of MoqTransfork specifying the media relationship and encoding.
Put simply, VLC/OBS would implement Karp while CDNs would implement MoqTransfork


## New Release 
I've been working on this hard fork for a while in my limited free time
There's a lot of new features getting merged at the same time.

- Experimental WASM player (Rust)
- New clustering protocol (using MoqTransfork)
- CMAF -> Karp transmuxing
- Broadcast discovery
- Simpler (but more powerful) API

## What's Next
I'm going to continue investing all of my free time (and hopefully some of my professional time) into MoQ.
But the time that would have been spent arguing with career Cisco employees is going to be better spent actually implementing cool shit.

I would highly encourage that anyone else do the same.
If you're an individual, startup, or a massive company alike, please yoink this open source code instead of subscribing to IETF politics.
