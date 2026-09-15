import { PermissionsAndroid, Platform } from 'react-native';
import Contacts from 'react-native-contacts';

// Clean phone numbers (remove spaces, hyphens, non-numeric characters except +)
const normalizePhoneNumber = (number) => {
  return number.replace(/[^\d+]/g, '');
};

export const syncDeviceContacts = async (userToken, apiBaseUrl) => {
  try {
    // 1. Request Permission
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_CONTACTS
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log('Permission to access contacts denied');
        return;
      }
    }

    // 2. Fetch Device Contacts
    const deviceContacts = await Contacts.getAll();
    const formattedContacts = [];

    deviceContacts.forEach((contact) => {
      const savedName = `${contact.givenName || ''} ${contact.familyName || ''}`.trim();
      contact.phoneNumbers.forEach((p) => {
        const cleanNumber = normalizePhoneNumber(p.number);
        if (cleanNumber.length >= 8) {
          formattedContacts.push({
            phoneNumber: cleanNumber,
            savedName: savedName || cleanNumber
          });
        }
      });
    });

    if (formattedContacts.length === 0) return;

    // 3. Post payload to Node.js backend
    const response = await fetch(`${apiBaseUrl}/api/contacts/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({ phoneNumbers: formattedContacts })
    });

    const data = await response.json();
    console.log('Sync Result:', data);
    return data;

  } catch (error) {
    console.error('Auto Contact Sync Error:', error);
  }
};