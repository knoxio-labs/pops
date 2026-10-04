UPDATE `purchase_sources`
SET `descriptor_pattern` = 'any-of:["AMAZON%AU%","AMAZON%AMZN.COM/BILL%"]'
WHERE `id` = 'amazon'
  AND `descriptor_pattern` = 'AMAZON%AU%';
