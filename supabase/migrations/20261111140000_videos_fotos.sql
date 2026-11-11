-- Vídeos e fotos de galeria do produto.
-- images: fotos iguais para todas as cores. Fotos por cor ficam em colors[].images, sem coluna nova.
alter table public.products
  add column videos text[] not null default '{}',
  add column images text[] not null default '{}';

-- O armazenamento passa a aceitar vídeos de até 50 MB. As fotos continuam comprimidas no painel.
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png', 'video/mp4', 'video/webm', 'video/quicktime']
  where id = 'produtos';
