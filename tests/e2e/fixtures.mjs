// Shared by the browser tests.

// The answers every member gives (lib/profileRewards.ts), for accounts the
// tests make or reuse: a SQL "set" list that fills only what's missing, so an
// account skips the required-details screen. Use it in an
// `update profiles set …` statement.
export const REQUIRED_DETAILS = `
  profile_created_for = coalesce(nullif(profile_created_for, ''), 'Myself'),
  date_of_birth = coalesce(date_of_birth, date '1995-06-15'),
  gender = coalesce(nullif(gender, ''), 'Female'),
  interested_in = coalesce(nullif(interested_in, ''), 'Men'),
  dating_intention = coalesce(nullif(dating_intention, ''), 'Marriage'),
  marital_status = coalesce(nullif(marital_status, ''), 'Never Married'),
  height = coalesce(nullif(height, ''), '5'' 5" (165 cm)'),
  country = coalesce(nullif(country, ''), 'India'),
  state = case when coalesce(nullif(country, ''), 'India') = 'India' then coalesce(nullif(state, ''), 'Maharashtra') else state end,
  city = coalesce(nullif(city, ''), 'Mumbai'),
  religion = coalesce(nullif(religion, ''), 'Hindu'),
  mother_tongue = coalesce(nullif(mother_tongue, ''), 'Marathi'),
  education_level = coalesce(nullif(education_level, ''), 'Bachelor''s'),
  occupation = coalesce(nullif(occupation, ''), 'Software Professional'),
  description = case when length(btrim(coalesce(description, ''))) >= 30 then description
                     else 'Kind, curious and close to family. Testing Shaadi24.' end`;
