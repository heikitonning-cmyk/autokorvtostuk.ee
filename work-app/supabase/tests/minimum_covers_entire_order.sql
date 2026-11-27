do $$
declare p jsonb:='{"version":1,"lift_enabled":true,"operator_work":true,"lift_rate":4500,"driver_rate":0,"operator_rate":1500,"helper_rate":3500,"drive_rate":4500,"km_rate":100,"minimum":9000,"helper_count":0,"drive_minutes":0,"km":28,"adjustment":0,"billed_minutes":null,"operator_minutes":null,"helper_minutes":null,"agreed_total":null}'; r jsonb;
begin
r:=private.customer_price(p,'10:00','11:00');
if (r->>'total')::int<>9000 or (r->>'minimumTopUp')::int<>200 then raise exception '45+15+28 must total 90 with 2 top-up'; end if;
r:=private.customer_price(p||'{"operator_work":false}','10:00','11:00');
if (r->>'total')::int<>9000 or (r->>'minimumTopUp')::int<>1700 then raise exception 'Minimum without labour'; end if;
r:=private.customer_price(p,'10:00','12:00');
if (r->>'total')::int<>14800 or (r->>'minimumTopUp')::int<>0 then raise exception 'Above minimum'; end if;
r:=private.customer_price(p||'{"agreed_total":8800}','10:00','11:00');
if (r->>'total')::int<>8800 then raise exception 'Explicit agreement changed'; end if;
r:=private.customer_price(p||'{"km":0,"drive_minutes":60}','10:00','11:00');
if (r->>'total')::int<>10500 then raise exception 'Tallinn transport'; end if;
end; $$;