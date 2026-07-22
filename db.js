// ===== 数据层：Supabase / localStorage 自动切换 =====
// 配置了 Supabase 就用云端，没配置就降级到本地存储（方便先预览流程）
const USE_SUPABASE = SUPABASE_URL && SUPABASE_URL.includes('supabase') &&
                    SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR-');

let _sb = null;
if (USE_SUPABASE) {
  _sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

const MAX_BORROW = 3; // 每人同时最多借阅未还数量

const db = {
  // 查询某孩子累计借阅总次数（所有状态都算，从使用系统开始累计）
  async getTotalBorrowCount(childName) {
    const name = (childName || '').trim();
    if (USE_SUPABASE) {
      const { count, error } = await _sb
        .from('library_borrowings')
        .select('*', { count: 'exact', head: true })
        .ilike('child_name', name);
      if (error) throw error;
      return count || 0;
    } else {
      const recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      return recs.filter(r => (r.child_name || '').trim() === name).length;
    }
  },

  // 查询某孩子「借出中（未还）」或「校区未收到」的记录
  async getUnreturned(childName) {
    const name = (childName || '').trim();
    if (USE_SUPABASE) {
      const { data, error } = await _sb
        .from('library_borrowings')
        .select('*')
        .in('status', ['borrowed', 'not_received'])
        .ilike('child_name', name);
      if (error) throw error;
      return data || [];
    } else {
      const recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      return recs.filter(r => (r.status === 'borrowed' || r.status === 'not_received') && (r.child_name || '').trim() === name);
    }
  },

  // 新增一条借阅记录
  async insert(record) {
    if (USE_SUPABASE) {
      const { data, error } = await _sb
        .from('library_borrowings')
        .insert(record)
        .select()
        .single();
      if (error) throw error;
      return data;
    } else {
      const recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      record.id = 'local_' + Date.now() + Math.random().toString(36).slice(2, 6);
      record.created_at = new Date().toISOString();
      recs.push(record);
      localStorage.setItem('dk_library_records', JSON.stringify(recs));
      return record;
    }
  },

  // 获取全部记录（管理后台用）
  async getAll() {
    if (USE_SUPABASE) {
      const { data, error } = await _sb
        .from('library_borrowings')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } else {
      return JSON.parse(localStorage.getItem('dk_library_records') || '[]');
    }
  },

  // 标记归还（家长点"我还了"）
  async markReturned(id) {
    if (USE_SUPABASE) {
      const { error } = await _sb
        .from('library_borrowings')
        .update({ status: 'returned', returned_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    } else {
      const recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      const r = recs.find(x => x.id === id);
      if (r) { r.status = 'returned'; r.returned_at = new Date().toISOString(); }
      localStorage.setItem('dk_library_records', JSON.stringify(recs));
    }
  },

  // 标记「校区未收到」（老师确认家长点了还书但实际没收到书）
  async markNotReceived(id) {
    if (USE_SUPABASE) {
      const { error } = await _sb
        .from('library_borrowings')
        .update({ status: 'not_received' })
        .eq('id', id);
      if (error) throw error;
    } else {
      const recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      const r = recs.find(x => x.id === id);
      if (r) r.status = 'not_received';
      localStorage.setItem('dk_library_records', JSON.stringify(recs));
    }
  },

  // 标记「确认收到」（老师从"未收到"恢复为"已归还"）
  async markReceived(id) {
    if (USE_SUPABASE) {
      const { error } = await _sb
        .from('library_borrowings')
        .update({ status: 'returned' })
        .eq('id', id);
      if (error) throw error;
    } else {
      const recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      const r = recs.find(x => x.id === id);
      if (r) r.status = 'returned';
      localStorage.setItem('dk_library_records', JSON.stringify(recs));
    }
  },

  // 删除记录
  async deleteRecord(id) {
    if (USE_SUPABASE) {
      await _sb.from('library_borrowings').delete().eq('id', id);
    } else {
      let recs = JSON.parse(localStorage.getItem('dk_library_records') || '[]');
      recs = recs.filter(x => x.id !== id);
      localStorage.setItem('dk_library_records', JSON.stringify(recs));
    }
  },

  // 上传图书封面：Supabase 模式上传到 Storage，本地模式直接存 base64
  async uploadPhoto(base64) {
    if (!USE_SUPABASE) return base64;
    const res = await fetch(base64);
    const blob = await res.blob();
    const ext = (base64.split(';')[0].split('/')[1] || 'png').replace('+xml', '');
    const fileName = `cover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { data, error } = await _sb.storage
      .from('book-covers')
      .upload(fileName, blob, { contentType: blob.type, upsert: false });
    if (error) throw error;
    const { data: urlData } = _sb.storage.from('book-covers').getPublicUrl(fileName);
    return urlData.publicUrl;
  }
};
