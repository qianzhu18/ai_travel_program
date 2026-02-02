import { db } from '../server/db';
import { templates } from '../drizzle/schema';

// 人群类型配置（固定 19 种）
const groupTypes = [
  { code: 'girl_child', displayName: '幼女' },
  { code: 'girl_young', displayName: '少女' },
  { code: 'woman_mature', displayName: '熟女' },
  { code: 'woman_elder', displayName: '奶奶' },
  { code: 'boy_child', displayName: '幼男' },
  { code: 'man_young', displayName: '少男' },
  { code: 'man_elder', displayName: '大叔' },
  { code: 'couple_love', displayName: '情侣' },
  { code: 'friends_girls', displayName: '闺蜜' },
  { code: 'friends_boys', displayName: '兄弟' },
  { code: 'friends_mixed', displayName: '异性伙伴' },
  { code: 'mom_son_child', displayName: '母子(少年)' },
  { code: 'mom_son_adult', displayName: '母子(青年)' },
  { code: 'mom_daughter_child', displayName: '母女(少年)' },
  { code: 'mom_daughter_adult', displayName: '母女(青年)' },
  { code: 'dad_son_child', displayName: '父子(少年)' },
  { code: 'dad_son_adult', displayName: '父子(青年)' },
  { code: 'dad_daughter_child', displayName: '父女(少年)' },
  { code: 'dad_daughter_adult', displayName: '父女(青年)' },
];

// 示例模板数据（根据你的 UI 截图）
const sampleTemplates = [
  {
    templateId: 'girl_young-001',
    name: '民国咖啡馆',
    imageUrl: 'https://via.placeholder.com/358x536/F5E6D3/8B7355?text=民国咖啡馆',
    thumbnailUrl: 'https://via.placeholder.com/179x268/F5E6D3/8B7355?text=民国咖啡馆',
    city: '上海',
    scenicSpot: '外滩',
    groupType: 'girl_young',
    photoType: 'single',
    faceType: 'both',
    price: 0,
    isFree: true,
    status: 'active',
    sortOrder: 1,
  },
  {
    templateId: 'girl_young-002',
    name: '敦煌飞天',
    imageUrl: 'https://via.placeholder.com/358x538/D4E4BC/6B8E23?text=敦煌飞天',
    thumbnailUrl: 'https://via.placeholder.com/179x269/D4E4BC/6B8E23?text=敦煌飞天',
    city: '敦煌',
    scenicSpot: '莫高窟',
    groupType: 'girl_young',
    photoType: 'single',
    faceType: 'both',
    price: 0,
    isFree: true,
    status: 'active',
    sortOrder: 2,
  },
  {
    templateId: 'girl_young-003',
    name: '盛唐宫廷',
    imageUrl: 'https://via.placeholder.com/357x536/FFE5B4/CD853F?text=盛唐宫廷',
    thumbnailUrl: 'https://via.placeholder.com/179x268/FFE5B4/CD853F?text=盛唐宫廷',
    city: '西安',
    scenicSpot: '大雁塔',
    groupType: 'girl_young',
    photoType: 'single',
    faceType: 'both',
    price: 0,
    isFree: true,
    status: 'active',
    sortOrder: 3,
  },
  {
    templateId: 'girl_young-004',
    name: '江南水乡',
    imageUrl: 'https://via.placeholder.com/360x540/E0C9A6/8B6914?text=江南水乡',
    thumbnailUrl: 'https://via.placeholder.com/180x270/E0C9A6/8B6914?text=江南水乡',
    city: '苏州',
    scenicSpot: '拙政园',
    groupType: 'girl_young',
    photoType: 'single',
    faceType: 'both',
    price: 0,
    isFree: true,
    status: 'active',
    sortOrder: 4,
  },
  {
    templateId: 'girl_young-005',
    name: '清凉古寺',
    imageUrl: 'https://via.placeholder.com/358x536/8B4513/FFFFFF?text=清凉古寺',
    thumbnailUrl: 'https://via.placeholder.com/179x268/8B4513/FFFFFF?text=清凉古寺',
    city: '杭州',
    scenicSpot: '灵隐寺',
    groupType: 'girl_young',
    photoType: 'single',
    faceType: 'both',
    price: 0,
    isFree: true,
    status: 'active',
    sortOrder: 5,
  },
  {
    templateId: 'girl_young-006',
    name: '云冈石窟',
    imageUrl: 'https://via.placeholder.com/358x536/D3D3D3/696969?text=云冈石窟',
    thumbnailUrl: 'https://via.placeholder.com/179x268/D3D3D3/696969?text=云冈石窟',
    city: '大同',
    scenicSpot: '云冈石窟',
    groupType: 'girl_young',
    photoType: 'single',
    faceType: 'both',
    price: 0,
    isFree: true,
    status: 'active',
    sortOrder: 6,
  },
];

async function seedTemplates() {
  try {
    console.log('开始添加测试模板数据...');

    // 插入模板数据
    for (const template of sampleTemplates) {
      await db.insert(templates).values(template);
      console.log(`✓ 已添加模板: ${template.name}`);
    }

    console.log('\n✅ 测试数据添加完成!');
    console.log(`\n📊 数据统计:`);
    console.log(`- 人群类型: ${groupTypes.length} 个`);
    console.log(`- 模板数量: ${sampleTemplates.length} 个`);
    console.log(`\n💡 提示: 现在可以在小程序中看到模板列表了！`);

    process.exit(0);
  } catch (error) {
    console.error('❌ 添加测试数据失败:', error);
    process.exit(1);
  }
}

seedTemplates();
