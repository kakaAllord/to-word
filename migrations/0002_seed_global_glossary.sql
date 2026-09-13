-- Global acronym fixes observed in Scribe output (spec 6.4).
insert into glossary_term (task_id, wrong, "right")
select null, v.wrong, v."right"
from (values ('MIVAF', 'MIVARF'), ('AMPOS', 'AMCOS'), ('Amcos', 'AMCOS')) as v(wrong, "right")
where not exists (
  select 1 from glossary_term g
  where g.task_id is null and lower(g.wrong) = lower(v.wrong)
);
