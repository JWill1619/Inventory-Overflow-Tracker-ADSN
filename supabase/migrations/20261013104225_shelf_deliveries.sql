-- Shelf totals are a view of immutable movements, never a current shelf balance.
-- Keep the existing replenishment action and add direct deliveries without pallet stock.
alter table adsn.inventory_movements
  drop constraint inventory_movements_action_type_check;
alter table adsn.inventory_movements
  add constraint inventory_movements_action_type_check check(action_type in(
    'PALLET_CREATED','PALLET_ACTIVATED','STOCK_ADDED','STOCK_REPLENISHED',
    'STOCK_ADJUSTED','STOCK_TRANSFERRED','PALLET_CLOSED','PALLET_EDITED','SHELF_DELIVERY'
  ));
alter table adsn.inventory_movements
  add constraint shelf_delivery_valid check(action_type <> 'SHELF_DELIVERY' or (
    product_id is not null and quantity > 0 and quantity <= 1000000
    and source_pallet_id is null and destination_pallet_id is null
    and quantity_before is null and quantity_after is null
    and notes is not null and length(trim(notes)) between 1 and 160
  ));
