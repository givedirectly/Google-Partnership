# Test Setup/Infrastructure

Our test setup is non-standard in various ways. This page describes how it
works.

## Cypress

We use [Cypress](https://cypress.io) to run tests. Cypress is an
end-to-end-focused browser-based system that leans heavily on common JavaScript
testing frameworks like [Mocha](https://mochajs.org/),
[Chai](https://www.chaijs.com/), and [Sinon](https://sinonjs.org/). We use it
both for end-to-end tests (under
[`integration_tests`](./integration/integration_tests)) and unit/small
integration tests (under [`unit_tests`](./integration/unit_tests)).

Cypress has a few very specific quirks.

*   It "queues up" all commands you give it to run later, in an async
    Promise-like manner. For more details, see the JSDoc for the `cyqueue`
    command in [`commands.js`](./support/commands.js), or the relevant
    [test](./integration/unit_tests/cyqueue_test.js).

*   It runs tests inside an iframe, while it itself is running in the rest of
    the browser. To run the tests, it packs up all of the relevant files using
    `browserify`. Unit tests that include production files that depend on
    libraries coming from `<script>` tags are difficult to handle in this setup,
    because there is no way to directly put a `<script>` tag into the page that
    Cypress loads, and similarly the test file cannot easily depend on the
    library. To get around that, we use a dynamic loading trick in
    [`script_loader.js](./support/script_loader.js).

*   Work that cannot be done in a browser environment can be done in a separate
    Node environment, entered via [`cypress.config.js`](../cypress.config.js).
    Things like reading test credentials, minting tokens, etc. is done there,
    and propagated out to test code using the `cy.task` command.

## Communicating with remote services

Our tests have to communicate with production services: Firestore, EarthEngine,
Google Maps. In order to authenticate, we store credentials for a test user
(`gd-earthengine-test-user@givedirectly.org`) as a GitHub secret and locally on
developer workstations. During the test, we mint access tokens using these
credentials and use them in tests.

For Firestore access, we copy production Firestore data for 2017-harvey and
2018-michael to a test database. This depends on the production database being
world-readable, at least for disaster metadata.

For EarthEngine, likewise, this depends on all relevant EarthEngine assets in
the `gd-earthengine-user@givedirctly.org` account being world-readable.

Both of these are necessary for public access to the page, so we expect them to
be true going forward.

## "Unit" tests

Our "unit" tests often talk to real (not mocked out) services like Firestore and
EarthEngine. This allows them to test against the real interfaces. However, this
means that they require network access to run, and so they would probably be
better classified as integration tests. Our "integration" tests are defined by
actually connecting to the server and loading a page, and so are actually
end-to-end tests.
