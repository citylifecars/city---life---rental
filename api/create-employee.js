import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Server configuration missing' });
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Verify the person making the request
    const { data: userData, error: userError } =
      await admin.auth.getUser(token);

    if (userError || !userData?.user) {
      return res.status(401).json({ error: 'Invalid login session' });
    }

    // Verify that person is an active owner
    const { data: ownerProfile, error: ownerError } = await admin
  .from('employee_profiles')
  .select('id, role, active')
  .eq('id', userData.user.id)
  .maybeSingle();

if (ownerError) {
  console.error('Owner profile lookup error:', ownerError);
  return res.status(500).json({ error: ownerError.message });
}

if (!ownerProfile) {
  return res.status(403).json({ error: 'Owner profile not found' });
}

if (String(ownerProfile.role).toLowerCase() !== 'owner') {
  return res.status(403).json({
    error: `Owner access required. Current role: ${ownerProfile.role}`
  });
}

if (ownerProfile.active !== true) {
  return res.status(403).json({ error: 'Owner account is inactive' });
}
      .from('employee_profiles')
      .select('role, active')
      .eq('id', userData.user.id)
      .single();

    if (
      ownerError ||
      !ownerProfile ||
      ownerProfile.role !== 'owner' ||
      !ownerProfile.active
    ) {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const { fullName, email, password, role } = req.body || {};

    const allowedRoles = ['manager', 'rental_agent', 'maintenance'];

    if (!fullName || !email || !password || !allowedRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid employee information' });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Temporary password must be at least 8 characters'
      });
    }

    // Create employee login
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true
      });

    if (createError) {
      return res.status(400).json({ error: createError.message });
    }

    // Create employee profile
    const { error: profileError } = await admin
      .from('employee_profiles')
      .insert({
        id: created.user.id,
        full_name: fullName.trim(),
        role,
        active: true
      });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return res.status(400).json({ error: profileError.message });
    }

    return res.status(200).json({
      success: true,
      employee: {
        id: created.user.id,
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        role,
        active: true
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create employee' });
  }
}
