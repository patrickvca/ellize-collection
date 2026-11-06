-- Aplicar só depois que o site com a cotação de frete estiver no ar.
drop function public.create_order(jsonb, text, text, text, text, text, text);
