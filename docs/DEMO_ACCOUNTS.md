# Development sample data

The optional `npm run seed --workspace backend` command inserts synthetic sample identities, facilities, and clinical records into the configured development database. It requires an explicitly set `DEMO_PASSWORD` and refuses to run when `NODE_ENV=production`. These records are for local workflow testing only and are not real patients, users, providers, or care advice.

The seed command does not create an administrator. Provision administrator credentials from the server with `npm run provision:admin --workspace backend`, using the `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_STAFF_ID`, and `INITIAL_ADMIN_PASSWORD` environment variables. There are no default administrator credentials or public administrator registration.
