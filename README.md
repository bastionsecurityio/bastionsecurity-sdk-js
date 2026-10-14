# Bastion JavaScript SDK

Browser telemetry, authenticated server scoring, proof challenges, and webhook verification.

Requires Node.js 20+. Install the current Git source release in your application:

```sh
npm install git+https://github.com/bastionsecurityio/bastionsecurity-sdk-js.git
```

Registry publication is separate from this Git release. Pin a reviewed revision and commit your dependency lockfile for production.

To run the examples, clone this repository and follow [examples/README.md](examples/README.md):

```sh
git clone https://github.com/bastionsecurityio/bastionsecurity-sdk-js.git
cd bastionsecurity-sdk-js
npm ci
npm run build
```

- [Setup and browser-to-server integration](docs/quickstart.md)
- [Server methods and language examples](docs/server-sdks.md)
- [Authentication and origin allowlists](docs/authentication.md)
- [Actions and enforcement](docs/decisions.md)
- [Batches and idempotency](docs/idempotency.md)
- [Single-use proof challenges](docs/challenges.md)
- [Signed webhooks and durable processing](docs/webhooks.md)
- [Enterprise SAML setup](docs/sso.md)
- [All developer guides](docs/README.md) · [live docs](https://bastionsecurity.io/docs)

The guides and the published verification function are generated from the same source as the website. The repository includes executable native JavaScript examples and the website's complete Node.js/PostgreSQL webhook receiver and worker. The shared receiver needs Node.js 20+; native signature verification uses this SDK.

Keep `BASTION_SECRET_KEY` on your server. Replace customer, price, and payment context with authenticated server values. Only an `allow` action permits the approval path; API errors and all other actions stop it. New sites start in monitor mode, where even high-risk traffic is allowed until you configure enforcement. Scoring receipts do not make payment or fulfillment operations idempotent.

Webhooks use their own signing secret and the exact raw request bytes. Deliveries can repeat; deduplicate delivery IDs and scored-event IDs, and acknowledge only after durable acceptance. Retries are bounded to five attempts; a failed delivery is not guaranteed to arrive. SAML authenticates existing workspace members, requires Enterprise, and uses the Bearer-authenticated control plane rather than scoring keys.

SDK contract tests and isolated local end-to-end tests remain available in this repository. See the test files for `BASTION_QA_SESSION`; end-to-end fixtures intentionally reject production hosts. The runnable examples can use your configured site and consume real decisions; they never perform payment or fulfillment.
