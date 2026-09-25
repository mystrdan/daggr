create schema if not exists private;

create or replace function private.record_auction_event()
returns trigger
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  event_kind text;
begin
  if tg_op = 'INSERT' then
    event_kind := 'created';
  elsif old.status is distinct from new.status then
    if new.status = 'ended' then
      event_kind := 'ended';
    elsif new.status = 'cancelled' then
      event_kind := 'cancelled';
    else
      event_kind := 'status_change';
    end if;
  elsif old.ends_at is distinct from new.ends_at then
    event_kind := 'extended';
  elsif old.current_price is distinct from new.current_price
     and old.bid_count is distinct from new.bid_count then
    event_kind := 'bid';
  elsif old.current_price is distinct from new.current_price then
    event_kind := 'price_change';
  elsif old.bid_count is distinct from new.bid_count then
    event_kind := 'bid';
  else
    return new;
  end if;

  insert into public.auction_events (
    auction_id, event_type, price, bid_count, occurred_at, metadata
  )
  values (
    new.id,
    event_kind,
    new.current_price,
    new.bid_count,
    coalesce(new.updated_at, now()),
    jsonb_build_object(
      'source_id', new.source_id,
      'external_id', new.external_id,
      'status', new.status
    )
  );

  return new;
end;
$$;

drop trigger if exists auctions_record_event on public.auctions;

create trigger auctions_record_event
after insert or update of status, ends_at, current_price, bid_count
on public.auctions
for each row
execute function private.record_auction_event();

revoke all on function private.record_auction_event() from public, anon, authenticated;
