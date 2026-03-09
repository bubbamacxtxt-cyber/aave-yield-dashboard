#!/bin/bash
# Test Aave v3 GraphQL API

curl -s -X POST https://api.v3.aave.com/graphql \
  -H "Content-Type: application/json" \
  -d '{ "query": "query Chains { chains { name chainId } }" }' | head -c 1000
