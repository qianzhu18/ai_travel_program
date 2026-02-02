-- 人群类型数据迁移脚本
-- 说明：请先执行 `pnpm run db:push` 确保 schema 已更新，再运行本脚本

ALTER TABLE `groupTypes`
  ADD COLUMN IF NOT EXISTS `description` varchar(100) NOT NULL DEFAULT '';

-- 重置人群类型为新的 19 种分类
DELETE FROM `groupTypes`;

INSERT INTO `groupTypes` (`code`, `displayName`, `description`, `photoType`, `sortOrder`, `isActive`) VALUES
  ('girl_child', '幼女', '4~12岁女童', 'single', 4, true),
  ('girl_young', '少女', '12~28岁年轻女性', 'single', 1, true),
  ('woman_mature', '熟女', '28~50岁成熟女性', 'single', 2, true),
  ('woman_elder', '奶奶', '50岁以上女性', 'single', 6, true),
  ('boy_child', '幼男', '4~12岁男童', 'single', 5, true),
  ('man_young', '少男', '12~45岁年轻男性', 'single', 3, true),
  ('man_elder', '大叔', '45岁以上男性', 'single', 7, true),
  ('couple_love', '情侣', '青年情侣', 'group', 0, true),
  ('friends_girls', '闺蜜', '青年女性好友', 'group', 0, true),
  ('friends_boys', '兄弟', '青年男性好友', 'group', 0, true),
  ('friends_mixed', '异性伙伴', '青年异性朋友', 'group', 0, true),
  ('mom_son_child', '母子(少年)', '母亲与4~14岁儿子', 'group', 0, true),
  ('mom_son_adult', '母子(青年)', '母亲与15~40岁儿子', 'group', 0, true),
  ('mom_daughter_child', '母女(少年)', '母亲与4~14岁女儿', 'group', 0, true),
  ('mom_daughter_adult', '母女(青年)', '母亲与15~40岁女儿', 'group', 0, true),
  ('dad_son_child', '父子(少年)', '父亲与4~14岁儿子', 'group', 0, true),
  ('dad_son_adult', '父子(青年)', '父亲与15~40岁儿子', 'group', 0, true),
  ('dad_daughter_child', '父女(少年)', '父亲与4~14岁女儿', 'group', 0, true),
  ('dad_daughter_adult', '父女(青年)', '父亲与15~40岁女儿', 'group', 0, true);

-- 旧人群类型 -> 新代码（模板相关表）
UPDATE `templates`
SET `groupType` = CASE `groupType`
  WHEN 'shaonv' THEN 'girl_young'
  WHEN 'shunv' THEN 'woman_mature'
  WHEN 'yuanqigege' THEN 'man_young'
  WHEN 'ruizhidashu' THEN 'man_elder'
  WHEN 'ruanmengnvhai' THEN 'girl_child'
  WHEN 'ertong' THEN 'boy_child'
  WHEN 'laonian' THEN 'woman_elder'
  ELSE `groupType`
END
WHERE `groupType` IN ('shaonv','shunv','yuanqigege','ruizhidashu','ruanmengnvhai','ertong','laonian');

UPDATE `templateDrafts`
SET `groupType` = CASE `groupType`
  WHEN 'shaonv' THEN 'girl_young'
  WHEN 'shunv' THEN 'woman_mature'
  WHEN 'yuanqigege' THEN 'man_young'
  WHEN 'ruizhidashu' THEN 'man_elder'
  WHEN 'ruanmengnvhai' THEN 'girl_child'
  WHEN 'ertong' THEN 'boy_child'
  WHEN 'laonian' THEN 'woman_elder'
  ELSE `groupType`
END
WHERE `groupType` IN ('shaonv','shunv','yuanqigege','ruizhidashu','ruanmengnvhai','ertong','laonian');

UPDATE `imageCache`
SET `groupType` = CASE `groupType`
  WHEN 'shaonv' THEN 'girl_young'
  WHEN 'shunv' THEN 'woman_mature'
  WHEN 'yuanqigege' THEN 'man_young'
  WHEN 'ruizhidashu' THEN 'man_elder'
  WHEN 'ruanmengnvhai' THEN 'girl_child'
  WHEN 'ertong' THEN 'boy_child'
  WHEN 'laonian' THEN 'woman_elder'
  ELSE `groupType`
END
WHERE `groupType` IN ('shaonv','shunv','yuanqigege','ruizhidashu','ruanmengnvhai','ertong','laonian');

-- 固定窄脸的人群类型：统一脸型为 narrow
UPDATE `templates`
SET `faceType` = 'narrow'
WHERE `groupType` IN (
  'girl_child','boy_child',
  'couple_love','friends_girls','friends_boys','friends_mixed',
  'mom_son_child','mom_son_adult','mom_daughter_child','mom_daughter_adult',
  'dad_son_child','dad_son_adult','dad_daughter_child','dad_daughter_adult'
) AND `faceType` <> 'narrow';

UPDATE `imageCache`
SET `faceType` = 'narrow'
WHERE `groupType` IN (
  'girl_child','boy_child',
  'couple_love','friends_girls','friends_boys','friends_mixed',
  'mom_son_child','mom_son_adult','mom_daughter_child','mom_daughter_adult',
  'dad_son_child','dad_son_adult','dad_daughter_child','dad_daughter_adult'
) AND `faceType` <> 'narrow';

UPDATE `templateDrafts`
SET `faceType` = 'narrow'
WHERE `groupType` IN (
  'girl_child','boy_child',
  'couple_love','friends_girls','friends_boys','friends_mixed',
  'mom_son_child','mom_son_adult','mom_daughter_child','mom_daughter_adult',
  'dad_son_child','dad_son_adult','dad_daughter_child','dad_daughter_adult'
) AND `faceType` IS NOT NULL AND `faceType` <> 'narrow';

-- 用户人群类型映射（兼容旧中文/旧代码）
UPDATE `users`
SET `userType` = CASE `userType`
  WHEN '幼女' THEN 'girl_child'
  WHEN '少女' THEN 'girl_young'
  WHEN '熟女' THEN 'woman_mature'
  WHEN '奶奶' THEN 'woman_elder'
  WHEN '幼男' THEN 'boy_child'
  WHEN '少男' THEN 'man_young'
  WHEN '大叔' THEN 'man_elder'
  WHEN '花季少女' THEN 'girl_young'
  WHEN '熟龄姐姐' THEN 'woman_mature'
  WHEN '元气哥哥' THEN 'man_young'
  WHEN '睿智大叔' THEN 'man_elder'
  WHEN '软萌女孩' THEN 'girl_child'
  WHEN '儿童' THEN 'boy_child'
  WHEN '长者' THEN 'woman_elder'
  WHEN 'shaonv' THEN 'girl_young'
  WHEN 'shunv' THEN 'woman_mature'
  WHEN 'yuanqigege' THEN 'man_young'
  WHEN 'ruizhidashu' THEN 'man_elder'
  WHEN 'ruanmengnvhai' THEN 'girl_child'
  WHEN 'ertong' THEN 'boy_child'
  WHEN 'laonian' THEN 'woman_elder'
  ELSE `userType`
END
WHERE `userType` IS NOT NULL AND `userType` <> '';
