-- The official stock code is the directory identity. Legacy free-text products stay intact.
alter table adsn.products add column stock_code text;
alter table adsn.products add constraint products_stock_code_valid check (stock_code is null or (stock_code = upper(trim(stock_code)) and length(stock_code) between 1 and 80));
create unique index products_stock_code_unique on adsn.products(stock_code) where stock_code is not null;
alter table adsn.products drop constraint products_normalized_name_brand_key;
create unique index products_legacy_name_unique on adsn.products(normalized_name,brand) where stock_code is null;
create index products_directory_name on adsn.products(normalized_name) where stock_code is not null;
