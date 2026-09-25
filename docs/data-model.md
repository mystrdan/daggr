# Daggr Data Model

## Core entities

### sources
Identifies where a market record came from.

### domains
Canonical domain identity shared across sources.

### auctions
Current/normalized auction state for a domain.

### auction_events
Historical observations and auction lifecycle events used for charts and activity analysis.

### sales
Completed sale records when a source provides reliable sale data.

## Design principle

Keep source-specific identifiers and URLs alongside normalized records. A domain can appear on multiple sources, and an auction can be updated many times without creating duplicate domain identities.
